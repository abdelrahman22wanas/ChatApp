package chat.protocol;

public final class Protocol {
    private Protocol() {}

    public static final String CONNECT = "CONNECT";
    public static final String WELCOME = "WELCOME";
    public static final String ERROR = "ERROR";

    public static final String MSG = "MSG";
    public static final String PM = "PM";
    public static final String SYS = "SYS";
    public static final String USERS = "USERS";
    public static final String FILE = "FILE";

    public static final String TARGET_ALL = "*";
}
