import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from './shared/filters/http-exception.filter';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  // rawBody: true makes req.rawBody available as a Buffer — required for
  // Paystack webhook signature verification (HMAC-SHA512 over the raw request body)
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Strips any properties not declared in DTOs and runs all validators
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
  }));

  // Catches every thrown HttpException and returns a uniform error shape:
  // { success: false, statusCode, message }
  app.useGlobalFilters(new HttpExceptionFilter());

  // Swagger UI available at /api
  const config = new DocumentBuilder()
    .setTitle('Fintech API')
    .setDescription('REST API for peer-to-peer money transfers')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
