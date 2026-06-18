/** Domain entity for a registered user. */
export interface User {
  id: string;
  name: string | null;
  createdAt: Date;
}

export interface NewUser {
  id: string;
  name: string | null;
  createdAt: Date;
}
