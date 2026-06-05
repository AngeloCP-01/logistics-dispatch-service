import { RabbitMQContainer, type StartedRabbitMQContainer } from "@testcontainers/rabbitmq";

export interface RabbitFixture {
  container: StartedRabbitMQContainer;
  url: string;
}

export async function startRabbit(): Promise<RabbitFixture> {
  const container = await new RabbitMQContainer("rabbitmq:3.13-management-alpine").start();
  return { container, url: container.getAmqpUrl() };
}

export async function stopRabbit(fx: RabbitFixture): Promise<void> {
  await fx.container.stop();
}
