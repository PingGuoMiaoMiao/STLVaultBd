import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class ModelsService {
  constructor(private prisma: PrismaService) {}

  findAll(category?: string, q?: string) {
    return this.prisma.model.findMany({
      where: {
        ...(category ? { category } : {}),
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: { _count: { select: { likes: true } } },
      orderBy: { id: 'asc' },
    });
  }

  async findOne(id: number) {
    const model = await this.prisma.model.findUnique({
      where: { id },
      include: { _count: { select: { likes: true } } },
    });
    if (!model) throw new NotFoundException(`模型 #${id} 不存在`);
    return model;
  }
}
