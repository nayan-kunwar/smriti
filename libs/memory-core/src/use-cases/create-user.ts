import { UserAlreadyExistsError } from '../errors';
import type { Clock, IdGenerator, UserRepository } from '../ports';
import type { User } from '../user-domain';

export interface CreateUserRequest {
  id?: string;
  name?: string;
}

export interface CreateUserDeps {
  users: UserRepository;
  clock: Clock;
  ids: IdGenerator;
}

export class CreateUserUseCase {
  constructor(private readonly deps: CreateUserDeps) {}

  async execute(input: CreateUserRequest): Promise<User> {
    const name = input.name?.trim() || null;
    const id = input.id ?? this.deps.ids.next();

    const existing = await this.deps.users.findById(id);
    if (existing) {
      throw new UserAlreadyExistsError(id);
    }

    return this.deps.users.insert({
      id,
      name,
      createdAt: this.deps.clock.now(),
    });
  }
}
