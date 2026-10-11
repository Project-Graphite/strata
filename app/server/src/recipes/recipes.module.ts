import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module';
import { RecipesController } from './recipes.controller';
import { RecipesService } from './recipes.service';

@Module({
  imports: [TasksModule],
  controllers: [RecipesController],
  providers: [RecipesService],
})
export class RecipesModule {}
