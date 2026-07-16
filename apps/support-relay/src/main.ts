import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json } from 'express';
import { AppModule } from './app.module';
async function bootstrap() { const app = await NestFactory.create(AppModule, { bodyParser: false }); app.use(json({ limit: '35mb' })); app.useGlobalPipes(new ValidationPipe({ transform: true })); await app.listen(Number(process.env.PORT || 3100), '0.0.0.0'); }
void bootstrap();
