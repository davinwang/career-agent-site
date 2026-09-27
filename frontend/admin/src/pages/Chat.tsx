import ChatPanel from "../components/chat/ChatPanel";

/** Full-height page wrapper for the admin agent chat. */
export default function Chat() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ChatPanel />
    </div>
  );
}
