import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { AUTH_COOKIE } from '../auth/auth.constants.js';
import { LoggedInGuard, type AuthedRequest } from '../auth/logged-in.guard.js';
import { CreateCommentDto } from './dto/create-comment.dto.js';
import { CreateModelDto } from './dto/create-model.dto.js';
import { UpdateModelDto } from './dto/update-model.dto.js';
import { ModelsService } from './models.service.js';
import { modelUploadOptions } from './upload.config.js';

@Controller('models')
export class ModelsController {
  constructor(
    private models: ModelsService,
    private jwt: JwtService,
  ) {}

  @Get()
  async findAll(
    @Req() req: Request,
    @Query('category') category?: string,
    @Query('q') q?: string,
    @Query('tag') tag?: string,
    @Query('sort') sort?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.models.findAll({
      category,
      q,
      tag,
      sort: sort === 'likes' ? 'likes' : 'newest',
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 12,
      userId: await this.optionalUserId(req),
    });
  }

  // 固定路径要放在 :id 之前，否则会被当成 id="mine"
  @Get('mine')
  @UseGuards(LoggedInGuard)
  mine(
    @Req() req: AuthedRequest,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.models.listMine(
      req.user!.id,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 12,
    );
  }

  @Get('favorites')
  @UseGuards(LoggedInGuard)
  favorites(
    @Req() req: AuthedRequest,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.models.listFavorites(
      req.user!.id,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 12,
    );
  }

  @Get(':id/comments')
  listComments(@Param('id', ParseIntPipe) id: number) {
    return this.models.listComments(id);
  }

  @Post(':id/comments')
  @UseGuards(LoggedInGuard)
  addComment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateCommentDto,
    @Req() req: AuthedRequest,
  ) {
    return this.models.addComment(id, req.user!.id, dto.content.trim());
  }

  @Delete(':id/comments/:commentId')
  @UseGuards(LoggedInGuard)
  removeComment(
    @Param('id', ParseIntPipe) id: number,
    @Param('commentId', ParseIntPipe) commentId: number,
    @Req() req: AuthedRequest,
  ) {
    return this.models.removeComment(id, commentId, req.user!.id);
  }

  @Post(':id/like')
  @UseGuards(LoggedInGuard)
  like(@Param('id', ParseIntPipe) id: number, @Req() req: AuthedRequest) {
    return this.models.like(id, req.user!.id);
  }

  @Delete(':id/like')
  @UseGuards(LoggedInGuard)
  unlike(@Param('id', ParseIntPipe) id: number, @Req() req: AuthedRequest) {
    return this.models.unlike(id, req.user!.id);
  }

  @Post(':id/favorite')
  @UseGuards(LoggedInGuard)
  favorite(@Param('id', ParseIntPipe) id: number, @Req() req: AuthedRequest) {
    return this.models.favorite(id, req.user!.id);
  }

  @Delete(':id/favorite')
  @UseGuards(LoggedInGuard)
  unfavorite(@Param('id', ParseIntPipe) id: number, @Req() req: AuthedRequest) {
    return this.models.unfavorite(id, req.user!.id);
  }

  /** 编辑自己的投稿（只改文字字段） */
  @Patch(':id')
  @UseGuards(LoggedInGuard)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateModelDto,
    @Req() req: AuthedRequest,
  ) {
    return this.models.update(id, req.user!.id, dto);
  }

  /** 换封面（只允许作者） */
  @Post(':id/cover')
  @UseGuards(LoggedInGuard)
  @UseInterceptors(FileInterceptor('image', modelUploadOptions))
  replaceCover(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: AuthedRequest,
  ) {
    if (!file) throw new BadRequestException('请选择封面图片');

    return this.models.replaceCover(
      id,
      req.user!.id,
      `/uploads/covers/${file.filename}`,
    );
  }

  /** 换 3D 文件（只允许作者） */
  @Post(':id/file')
  @UseGuards(LoggedInGuard)
  @UseInterceptors(FileInterceptor('model', modelUploadOptions))
  replaceFile(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: AuthedRequest,
  ) {
    if (!file) throw new BadRequestException('请选择 .glb / .gltf 模型文件');

    return this.models.replaceFile(
      id,
      req.user!.id,
      `/uploads/models/${file.filename}`,
    );
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    return this.models.findOne(id, await this.optionalUserId(req));
  }

  /** 发布模型：需要登录，multipart 上传 .glb + 可选封面 */
  @Post()
  @UseGuards(LoggedInGuard)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'model', maxCount: 1 },
        { name: 'image', maxCount: 1 },
      ],
      modelUploadOptions,
    ),
  )
  create(
    @Body() dto: CreateModelDto,
    @UploadedFiles()
    files: {
      model?: Express.Multer.File[];
      image?: Express.Multer.File[];
    },
    @Req() req: AuthedRequest,
  ) {
    const modelFile = files?.model?.[0];
    if (!modelFile) throw new BadRequestException('请上传 .glb / .gltf 模型文件');

    const imageFile = files?.image?.[0];

    return this.models.create({
      title: dto.title,
      description: dto.description,
      category: dto.category,
      tags: dto.tags,
      image: imageFile ? `/uploads/covers/${imageFile.filename}` : undefined,
      modelUrl: `/uploads/models/${modelFile.filename}`,
      userId: req.user!.id,
    });
  }

  /** 删除自己的投稿 */
  @Delete(':id')
  @UseGuards(LoggedInGuard)
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: AuthedRequest) {
    return this.models.remove(id, req.user!.id);
  }

  /** 可选登录：带有效 cookie 就返回用户 id，否则返回 null（用于 liked 字段） */
  private async optionalUserId(req: Request): Promise<number | null> {
    const token = (req.cookies as Record<string, string> | undefined)?.[
      AUTH_COOKIE
    ];
    if (!token) return null;

    try {
      const payload = await this.jwt.verifyAsync<{ sub: number }>(token);
      return payload.sub;
    } catch {
      return null;
    }
  }
}
