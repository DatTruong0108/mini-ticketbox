/**
 * Application-level Role enum.
 * Mirrors the Prisma `Role` enum so guards/decorators remain decoupled
 * from the ORM layer.
 */
export enum Role {
  USER = 'USER',
  ADMIN = 'ADMIN',
}
