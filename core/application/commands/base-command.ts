// Base Command class for CQRS pattern

export abstract class Command {
  public readonly id: string;
  public readonly timestamp: Date;

  constructor() {
    this.id = this.generateId();
    this.timestamp = new Date();
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }
}

export interface CommandHandler<T extends Command> {
  handle(command: T): Promise<void>;
}

export interface CommandBus {
  send<T extends Command>(command: T): Promise<void>;
  register<T extends Command>(commandType: new (...args: any[]) => T, handler: CommandHandler<T>): void;
}
