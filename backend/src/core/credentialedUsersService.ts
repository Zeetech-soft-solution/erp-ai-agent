export interface CredentialedUser {
  email: string;
  name: string;
  department?: string;
  designation?: string;
}

export async function listCredentialedUsers(): Promise<CredentialedUser[]> {
  return [];
}
