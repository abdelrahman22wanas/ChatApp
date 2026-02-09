package chat.model;

import java.time.Instant;

public class Message {
    private final String from;
    private final String content;
    private final Instant timestamp;

    public Message(String from, String content, Instant timestamp) {
        this.from = from;
        this.content = content;
        this.timestamp = timestamp;
    }

    public String getFrom() {
        return from;
    }

    public String getContent() {
        return content;
    }

    public Instant getTimestamp() {
        return timestamp;
    }
}
