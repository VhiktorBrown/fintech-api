import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from './shared/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Strips any properties not declared in DTOs and runs all validators
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
  }));

  // Catches every thrown HttpException and returns a uniform error shape:
  // { success: false, statusCode, message }
  app.useGlobalFilters(new HttpExceptionFilter());

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
