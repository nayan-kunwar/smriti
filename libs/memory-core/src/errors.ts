export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class MemoryNotFoundError extends DomainError {
  constructor(id: string) {
    super(`Memory ${id} was not found`, 'MEMORY_NOT_FOUND');
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
  }
}

export class UserNotFoundError extends DomainError {
  constructor(id: string) {
    super(`User ${id} was not found`, 'USER_NOT_FOUND');
  }
}

export class UserAlreadyExistsError extends DomainError {
  constructor(id: string) {
    super(`User ${id} already exists`, 'USER_ALREADY_EXISTS');
  }
}

export class ProfileNotFoundError extends DomainError {
  constructor(userId: string) {
    super(`Profile for user ${userId} was not found`, 'PROFILE_NOT_FOUND');
  }
}
