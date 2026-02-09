package chat.client;

import javafx.animation.FadeTransition;
import javafx.application.Application;
import javafx.application.Platform;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Scene;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.ListView;
import javafx.scene.control.ScrollPane;
import javafx.scene.control.TextField;
import javafx.scene.effect.DropShadow;
import javafx.scene.layout.BorderPane;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.VBox;
import javafx.scene.paint.Color;
import javafx.stage.FileChooser;
import javafx.stage.Stage;
import javafx.util.Duration;

import java.io.File;
import java.nio.file.Path;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

public class ChatFxApp extends Application implements ChatClient.Listener {
    private final VBox chatBox = new VBox(8);
    private final ScrollPane chatScroll = new ScrollPane(chatBox);
    private final TextField inputField = new TextField();
    private final Button sendButton = new Button("Send");
    private final Button fileButton = new Button("Send File");
    private final ListView<String> userList = new ListView<>();

    private ChatClient client;
    private final DateTimeFormatter timeFormatter = DateTimeFormatter.ofPattern("HH:mm").withZone(ZoneId.systemDefault());

    @Override
    public void start(Stage stage) {
        stage.setTitle("Java Chat Application");

        BorderPane root = new BorderPane();
        root.getStyleClass().add("root");

        chatBox.getStyleClass().add("chat-box");
        chatScroll.setFitToWidth(true);
        chatScroll.setHbarPolicy(ScrollPane.ScrollBarPolicy.NEVER);
        chatScroll.getStyleClass().add("chat-scroll");

        VBox sidePanel = new VBox(10);
        sidePanel.getStyleClass().add("side-panel");
        Label usersLabel = new Label("Online Users");
        usersLabel.getStyleClass().add("section-title");
        userList.getStyleClass().add("user-list");
        sidePanel.getChildren().addAll(usersLabel, userList);
        VBox.setVgrow(userList, Priority.ALWAYS);

        HBox inputBar = new HBox(10, inputField, fileButton, sendButton);
        inputBar.setAlignment(Pos.CENTER_LEFT);
        inputBar.setPadding(new Insets(12));
        inputBar.getStyleClass().add("input-bar");
        HBox.setHgrow(inputField, Priority.ALWAYS);
        inputField.setPromptText("Type a message or /pm username message...");

        root.setCenter(chatScroll);
        root.setRight(sidePanel);
        root.setBottom(inputBar);

        DropShadow panelShadow = new DropShadow(18, Color.color(0, 0, 0, 0.25));
        sidePanel.setEffect(panelShadow);
        inputBar.setEffect(new DropShadow(12, Color.color(0, 0, 0, 0.18)));

        sendButton.setOnAction(e -> sendMessage());
        inputField.setOnAction(e -> sendMessage());
        fileButton.setOnAction(e -> sendFile(stage));

        Scene scene = new Scene(root, 980, 640);
        attachStyles(scene);
        stage.setScene(scene);
        stage.show();

        connect();
    }

    private void attachStyles(Scene scene) {
        String css = null;
        if (ChatFxApp.class.getResource("/chat/client/chatfx.css") != null) {
            css = ChatFxApp.class.getResource("/chat/client/chatfx.css").toExternalForm();
        } else {
            Path fallback = Path.of("src", "chat", "client", "chatfx.css");
            if (fallback.toFile().exists()) {
                css = fallback.toUri().toString();
            }
        }
        if (css != null) {
            scene.getStylesheets().add(css);
        }
    }

    private void connect() {
        String host = PromptDialogs.prompt("Server host", "localhost");
        String portStr = PromptDialogs.prompt("Server port", "12345");
        String username = PromptDialogs.prompt("Choose a username", "User" + System.currentTimeMillis());

        int port = 12345;
        try {
            port = Integer.parseInt(portStr);
        } catch (NumberFormatException ignored) {
        }

        try {
            client = new ChatClient(host, port, username, this);
            client.connect();
            appendSystem("Connected as " + username);
        } catch (Exception e) {
            appendSystem("Failed to connect: " + e.getMessage());
        }
    }

    private void sendMessage() {
        String text = inputField.getText().trim();
        if (text.isEmpty()) {
            return;
        }
        inputField.clear();

        if (text.startsWith("/pm ")) {
            String[] parts = text.split(" ", 3);
            if (parts.length < 3) {
                appendSystem("Usage: /pm username message");
                return;
            }
            try {
                client.sendPrivateMessage(parts[1], parts[2]);
            } catch (Exception e) {
                appendSystem("Failed to send private message: " + e.getMessage());
            }
            return;
        }

        if (text.startsWith("/file ")) {
            String[] parts = text.split(" ", 3);
            if (parts.length < 3) {
                appendSystem("Usage: /file username path");
                return;
            }
            Path path = Path.of(parts[2]);
            try {
                client.sendFile(parts[1], path);
                appendSystem("File sent to " + parts[1] + ": " + path.getFileName());
            } catch (Exception e) {
                appendSystem("Failed to send file: " + e.getMessage());
            }
            return;
        }

        try {
            client.sendMessage(text);
        } catch (Exception e) {
            appendSystem("Failed to send message: " + e.getMessage());
        }
    }

    private void sendFile(Stage stage) {
        FileChooser chooser = new FileChooser();
        chooser.setTitle("Select a file to send");
        File file = chooser.showOpenDialog(stage);
        if (file == null) {
            return;
        }

        String target = userList.getSelectionModel().getSelectedItem();
        if (target == null || target.isBlank()) {
            target = PromptDialogs.prompt("Send file to username", "");
        }
        if (target == null || target.isBlank()) {
            return;
        }

        try {
            client.sendFile(target, file.toPath());
            appendSystem("File sent to " + target + ": " + file.getName());
        } catch (Exception e) {
            appendSystem("Failed to send file: " + e.getMessage());
        }
    }

    private void appendMessage(String prefix, String message, Instant timestamp, String styleClass) {
        String time = timeFormatter.format(timestamp);
        Label bubble = new Label("[" + time + "] " + prefix + " " + message);
        bubble.getStyleClass().addAll("message", styleClass);
        bubble.setWrapText(true);
        bubble.setMaxWidth(640);
        chatBox.getChildren().add(bubble);
        animateIn(bubble);
        Platform.runLater(() -> chatScroll.setVvalue(1.0));
    }

    private void animateIn(Label node) {
        FadeTransition ft = new FadeTransition(Duration.millis(220), node);
        ft.setFromValue(0);
        ft.setToValue(1);
        ft.play();
    }

    private void appendSystem(String message) {
        appendMessage("[System]", message, Instant.now(), "system");
    }

    @Override
    public void onMessage(String from, String message, Instant timestamp) {
        Platform.runLater(() -> appendMessage("[" + from + "]", message, timestamp, "incoming"));
    }

    @Override
    public void onPrivateMessage(String from, String message, Instant timestamp) {
        Platform.runLater(() -> appendMessage("[PM from " + from + "]", message, timestamp, "private"));
    }

    @Override
    public void onSystemMessage(String message, Instant timestamp) {
        Platform.runLater(() -> appendMessage("[System]", message, timestamp, "system"));
    }

    @Override
    public void onUsersUpdate(String[] users) {
        Platform.runLater(() -> userList.getItems().setAll(users));
    }

    @Override
    public void onFileReceived(String from, String fileName, Path savedPath, long size) {
        Platform.runLater(() -> appendSystem("Received file from " + from + ": " + fileName + " (" + size + " bytes). Saved to " + savedPath));
    }

    @Override
    public void onError(String message) {
        Platform.runLater(() -> appendSystem(message));
    }

    public static void main(String[] args) {
        launch(args);
    }
}
