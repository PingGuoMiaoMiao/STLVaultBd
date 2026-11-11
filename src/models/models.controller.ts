import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ModelsService } from './models.service.js';

@Controller('models')
export class ModelsController {
  constructor(private models: ModelsService) {}

  @Get()
  findAll(
    @Query('category') category?: string,
    @Query('q') q?: string,
  ) {
    return this.models.findAll(category, q);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.models.findOne(id);
  }
}
