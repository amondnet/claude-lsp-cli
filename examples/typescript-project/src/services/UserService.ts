import { DatabaseConnection } from '../database/Connection';

export interface User {
  id: number;
  name: string;
  email: string;
  createdAt: Date;
}

export class UserService {
  private db: DatabaseConnection;
  
  constructor() {
    this.db = new DatabaseConnection();
  }
  
  async getAllUsers(): Promise<User[]> {
    // Type error: returning wrong type
    return "not an array"; // Should return User[]
  }
  
  async getUserById(id: number): Promise<User | null> {
    if (typeof id !== 'number') {
      throw new Error('ID must be a number');
    }
    
    // Missing return statement - another error
    const user = await this.db.findUserById(id);
    // Should return user but missing return
  }
  
  async createUser(userData: User): Promise<User> {
    // Property access error
    const newUser = {
      id: Math.random(),
      name: userData.firstName, // Error: should be 'name'
      email: userData.email,
      createdAt: new Date()
    };
    
    return this.db.saveUser(newUser);
  }
}