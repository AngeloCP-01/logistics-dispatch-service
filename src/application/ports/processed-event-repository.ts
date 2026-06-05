export interface ProcessedEventRepository {
  recordIfNew(eventId: string, eventType: string): Promise<boolean>;
}
