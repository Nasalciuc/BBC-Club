import { Producer } from "@platformatic/kafka";

/** acks -1 is the client's "all". Idempotent so a retry does not append a second copy. */
export function createKafkaProducer(brokers: string, clientId: string) {
  const bootstrapBrokers = brokers
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return new Producer({
    clientId,
    bootstrapBrokers,
    acks: -1,
    idempotent: true,
  });
}

export type KafkaProducer = ReturnType<typeof createKafkaProducer>;
