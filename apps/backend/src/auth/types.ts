/** User-Objekt an request.user (ohne passwordHash, für geschützte Routen). */
export type RequestUser = {
  id: string;
  name: string;
  email: string | null;
  isAdmin: boolean;
};
