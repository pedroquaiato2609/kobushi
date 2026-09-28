export class AppError extends Error {
  constructor(message: string, public statusCode = 500, public code?: string) {
    super(message);
    this.name = 'AppError';
  }
}
export class NotFoundError extends AppError {
  constructor(what: string) {
    super(`${what} não encontrado(a).`, 404);
  }
}
export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400);
  }
}
export class ProviderError extends AppError {
  constructor(message: string) {
    super(message, 502);
  }
}
