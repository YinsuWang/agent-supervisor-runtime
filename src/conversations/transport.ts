import type { ConversationBinding } from "./binding.js";

export type TransportStatus = "OFFLINE" | "STANDBY" | "ACTIVE" | "DRAINING";

export type TransportHealth = {
  status: TransportStatus;
  detail?: string;
};

export type TransportMessage = {
  messageId: string;
  bindingId: string;
  content: string;
};

export type TransportSendContext = {
  leaseEpoch: number;
};

export type TransportResponse = {
  content: string;
};

export type ResponseRequest = {
  bindingId: string;
  inReplyTo: string;
};

export interface ConversationTransport {
  readonly id: string;
  connect(binding: ConversationBinding): Promise<void>;
  send(message: TransportMessage, context: TransportSendContext): Promise<void>;
  waitForResponse(request: ResponseRequest): Promise<TransportResponse>;
  health(): Promise<TransportHealth>;
  disconnect(): Promise<void>;
}
