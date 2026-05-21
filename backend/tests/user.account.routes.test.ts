import jwt from 'jsonwebtoken';
import request from 'supertest';

const mockGetUserById = jest.fn();
const mockDeleteUserAccountData = jest.fn();

jest.mock('../src/services/supabase', () => ({
  getUserById: (...args: unknown[]) => mockGetUserById(...args),
  deleteUserAccountData: (...args: unknown[]) => mockDeleteUserAccountData(...args),
  getUserUsage: jest.fn(),
}));

import app from '../src/server';

function createAuthToken(userId: string, email = 'test@example.com') {
  return jwt.sign({ userId, email }, process.env.JWT_SECRET || 'test-jwt-secret');
}

describe('User Account Deletion Route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 404 when the user does not exist', async () => {
    mockGetUserById.mockResolvedValue(null);

    const token = createAuthToken('user-missing');

    const response = await request(app)
      .delete('/api/user/account')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('User not found');
  });

  it('deletes account and associated data successfully', async () => {
    mockGetUserById.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
    });
    mockDeleteUserAccountData.mockResolvedValue({
      deletedUser: true,
      deletedStorageObjects: 2,
    });

    const token = createAuthToken('user-1');

    const response = await request(app)
      .delete('/api/user/account')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.deletedStorageObjects).toBe(2);
    expect(mockDeleteUserAccountData).toHaveBeenCalledWith('user-1');
  });
});

