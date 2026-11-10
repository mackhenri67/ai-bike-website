export type ChatMessage = {
  id: string;
  sender_role: "customer" | "admin";
  body: string;
  created_at: string;
  client_id: string;
};
export type ChatThread = {
  conversation_id: string | null;
  messages: ChatMessage[];
  has_more: boolean;
  unread_count: number;
};
export type ChatConversation = {
  id: string;
  customer_name: string;
  customer_email: string | null;
  last_message: string;
  last_sender: "customer" | "admin";
  last_message_at: string;
  unread_count: number;
};
export type ChatInbox = { conversations: ChatConversation[]; has_more: boolean; unread_count: number };
export type ChatSent = { conversation_id: string; message: ChatMessage };
