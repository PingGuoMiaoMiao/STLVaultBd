import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service.js';
import { UPLOAD_ROOT } from './upload.config.js';

/** 评论里带的作者信息，避免前端再查一次用户 */
const COMMENT_USER_SELECT = {
  id: true,
  nickname: true,
  username: true,
  avatar: true,
} as const;

export type SortOption = 'newest' | 'likes';

export type ListParams = {
  category?: string;
  q?: string;
  tag?: string;
  sort?: SortOption;
  page?: number;
  pageSize?: number;
  userId?: number | null;
};

@Injectable()
export class ModelsService {
  constructor(private prisma: PrismaService) {}

  /** 公共列表：分页 + 分类 / 关键词 / 标签筛选 + 排序 */
  async findAll(params: ListParams) {
    const { page, pageSize } = this.paging(params);

    const where = {
      ...(params.category ? { category: params.category } : {}),
      ...(params.tag
        ? { tags: { contains: params.tag, mode: 'insensitive' as const } }
        : {}),
      ...(params.q
        ? {
            OR: [
              { title: { contains: params.q, mode: 'insensitive' as const } },
              {
                description: {
                  contains: params.q,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };

    return this.paginate(where, page, pageSize, params.sort, params.userId);
  }

  /** 我的投稿 */
  async listMine(userId: number, page = 1, pageSize = 12) {
    const size = Math.min(48, Math.max(1, pageSize));
    return this.paginate({ userId }, Math.max(1, page), size, 'newest', userId);
  }

  /** 我的收藏 */
  async listFavorites(userId: number, page = 1, pageSize = 12) {
    const size = Math.min(48, Math.max(1, pageSize));
    return this.paginate(
      { favorites: { some: { userId } } },
      Math.max(1, page),
      size,
      'newest',
      userId,
    );
  }

  async findOne(id: number, userId?: number | null) {
    const model = await this.prisma.model.findUnique({
      where: { id },
      include: { _count: { select: { likes: true } } },
    });
    if (!model) throw new NotFoundException(`模型 #${id} 不存在`);

    const [withFlags] = await this.withFlags([model], userId);
    return withFlags;
  }

  /** 发布：把上传后的文件地址和表单内容写进 models 表 */
  async create(input: {
    title: string;
    description: string;
    category: string;
    tags?: string;
    image?: string;
    modelUrl: string;
    userId: number;
  }) {
    const model = await this.prisma.model.create({
      data: input,
      include: { _count: { select: { likes: true } } },
    });

    return { ...model, liked: false, favorited: false };
  }

  /** 编辑自己的投稿（只改文字字段，文件保持不变） */
  async update(
    modelId: number,
    userId: number,
    input: {
      title?: string;
      description?: string;
      category?: string;
      tags?: string;
    },
  ) {
    const model = await this.prisma.model.findUnique({
      where: { id: modelId },
      select: { id: true, userId: true },
    });
    if (!model) throw new NotFoundException(`模型 #${modelId} 不存在`);
    if (model.userId !== userId) {
      throw new ForbiddenException('只能编辑自己的投稿');
    }

    return this.prisma.model.update({
      where: { id: modelId },
      data: input,
      include: { _count: { select: { likes: true } } },
    });
  }

  /** 换封面：写入新路径并删掉旧文件 */
  async replaceCover(modelId: number, userId: number, url: string) {
    const model = await this.assertOwner(modelId, userId);

    const updated = await this.prisma.model.update({
      where: { id: modelId },
      data: { image: url },
    });

    await this.removeUpload(model.image);
    return { image: updated.image };
  }

  /** 换 3D 文件：写入新路径并删掉旧文件 */
  async replaceFile(modelId: number, userId: number, url: string) {
    const model = await this.assertOwner(modelId, userId);

    const updated = await this.prisma.model.update({
      where: { id: modelId },
      data: { modelUrl: url },
    });

    await this.removeUpload(model.modelUrl);
    return { modelUrl: updated.modelUrl };
  }

  /** 点赞 / 取消点赞 */
  async like(modelId: number, userId: number) {
    await this.assertModelExists(modelId);

    await this.prisma.modelLike.upsert({
      where: { userId_modelId: { userId, modelId } },
      create: { userId, modelId },
      update: {},
    });

    return this.likeState(modelId, userId);
  }

  async unlike(modelId: number, userId: number) {
    await this.assertModelExists(modelId);

    await this.prisma.modelLike.deleteMany({ where: { userId, modelId } });

    return this.likeState(modelId, userId);
  }

  /** 收藏 / 取消收藏 */
  async favorite(modelId: number, userId: number) {
    await this.assertModelExists(modelId);

    await this.prisma.favorite.upsert({
      where: { userId_modelId: { userId, modelId } },
      create: { userId, modelId },
      update: {},
    });

    return { favorited: true };
  }

  async unfavorite(modelId: number, userId: number) {
    await this.assertModelExists(modelId);

    await this.prisma.favorite.deleteMany({ where: { userId, modelId } });

    return { favorited: false };
  }

  /** 删除自己的投稿，同时清掉磁盘上的 glb 和封面 */
  async remove(modelId: number, userId: number) {
    const model = await this.prisma.model.findUnique({
      where: { id: modelId },
      select: { id: true, userId: true, modelUrl: true, image: true },
    });
    if (!model) throw new NotFoundException(`模型 #${modelId} 不存在`);
    if (model.userId !== userId) {
      throw new ForbiddenException('只能删除自己的投稿');
    }

    await this.prisma.model.delete({ where: { id: modelId } });
    await this.removeUpload(model.modelUrl);
    await this.removeUpload(model.image);

    return { ok: true };
  }

  /** 评论列表：最新在前，带上评论者昵称 */
  async listComments(modelId: number) {
    await this.assertModelExists(modelId);

    return this.prisma.comment.findMany({
      where: { modelId },
      include: { user: { select: COMMENT_USER_SELECT } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** 发表评论：必须登录，用户 id 由守卫写入 req.user */
  async addComment(modelId: number, userId: number, content: string) {
    await this.assertModelExists(modelId);

    return this.prisma.comment.create({
      data: { modelId, userId, content },
      include: { user: { select: COMMENT_USER_SELECT } },
    });
  }

  /** 删除自己的评论 */
  async removeComment(modelId: number, commentId: number, userId: number) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, userId: true, modelId: true },
    });
    if (!comment || comment.modelId !== modelId) {
      throw new NotFoundException('评论不存在');
    }
    if (comment.userId !== userId) {
      throw new ForbiddenException('只能删除自己的评论');
    }

    await this.prisma.comment.delete({ where: { id: commentId } });
    return { ok: true };
  }

  /** 统一的分页查询，返回 items + 总数 + 是否还有下一页 */
  private async paginate(
    where: Record<string, unknown>,
    page: number,
    pageSize: number,
    sort: SortOption = 'newest',
    userId?: number | null,
  ) {
    const orderBy =
      sort === 'likes'
        ? ({ likes: { _count: 'desc' } } as const)
        : ({ createdAt: 'desc' } as const);

    const [total, rows] = await Promise.all([
      this.prisma.model.count({ where }),
      this.prisma.model.findMany({
        where,
        include: { _count: { select: { likes: true } } },
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: await this.withFlags(rows, userId),
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
    };
  }

  private paging(params: ListParams) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(48, Math.max(1, params.pageSize ?? 12));
    return { page, pageSize };
  }

  /** 补上 liked / favorited 两个布尔字段 */
  private async withFlags<T extends { id: number }>(
    models: T[],
    userId?: number | null,
  ) {
    if (!models.length || !userId) {
      return models.map((model) => ({
        ...model,
        liked: false,
        favorited: false,
      }));
    }

    const ids = models.map((model) => model.id);

    const [likes, favorites] = await Promise.all([
      this.prisma.modelLike.findMany({
        where: { userId, modelId: { in: ids } },
        select: { modelId: true },
      }),
      this.prisma.favorite.findMany({
        where: { userId, modelId: { in: ids } },
        select: { modelId: true },
      }),
    ]);

    const likedIds = new Set(likes.map((row) => row.modelId));
    const favoritedIds = new Set(favorites.map((row) => row.modelId));

    return models.map((model) => ({
      ...model,
      liked: likedIds.has(model.id),
      favorited: favoritedIds.has(model.id),
    }));
  }

  private async likeState(modelId: number, userId: number) {
    const [likes, mine] = await Promise.all([
      this.prisma.modelLike.count({ where: { modelId } }),
      this.prisma.modelLike.count({ where: { userId, modelId } }),
    ]);

    return { liked: mine > 0, likes };
  }

  /** 只处理 /uploads/ 下的文件，防止越权删系统文件 */
  private async removeUpload(url?: string | null) {
    if (!url || !url.startsWith('/uploads/')) return;

    const relative = url.slice('/uploads/'.length);
    if (relative.includes('..')) return;

    await rm(join(UPLOAD_ROOT, relative), { force: true });
  }

  private async assertModelExists(modelId: number) {
    const model = await this.prisma.model.findUnique({
      where: { id: modelId },
      select: { id: true },
    });
    if (!model) throw new NotFoundException(`模型 #${modelId} 不存在`);
  }

  /** 校验模型存在且属于当前用户 */
  private async assertOwner(modelId: number, userId: number) {
    const model = await this.prisma.model.findUnique({
      where: { id: modelId },
      select: { id: true, userId: true, image: true, modelUrl: true },
    });
    if (!model) throw new NotFoundException(`模型 #${modelId} 不存在`);
    if (model.userId !== userId) {
      throw new ForbiddenException('只能编辑自己的投稿');
    }
    return model;
  }
}
