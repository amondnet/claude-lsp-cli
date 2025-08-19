import { User } from '../services/UserService';

export class DatabaseConnection {
  private connected: boolean = false;
  
  constructor() {
    this.connect();
  }
  
  private async connect(): void {
    // Simulate connection
    await new Promise(resolve => setTimeout(resolve, 100));
    this.connected = true;
    console.log('Database connected');
  }
  
  async findUserById(id: number): Promise<User | null> {
    if (!this.connected) {
      throw new Error('Database not connected');
    }
    
    // Simulate database query with intentional errors
    const mockUser: User = {
      id: id,
      name: 'John Doe',
      email: 'john@example.com',
      createdAt: 'invalid date' // Type error: should be Date
    };
    
    return mockUser;
  }
  
  async saveUser(user: User): Promise<User> {
    if (!this.connected) {
      throw new Error('Database not connected');
    }
    
    // Type error: accessing non-existent property
    console.log(`Saving user: ${user.fullName}`); // Should be 'name'
    
    return user;
  }
  
  async disconnect(): void {
    this.connected = false;
    console.log('Database disconnected');
  }
}