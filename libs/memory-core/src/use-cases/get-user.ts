import { UserNotFoundError } from '../errors';
import type { UserRepository } from '../ports';
import type { User } from '../user-domain';

export class GetUserUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute(id: string): Promise<User> {
    const user = await this.users.findById(id);
    if (!user) {
      throw new UserNotFoundError(id);
    }
    return user;
  }
}
