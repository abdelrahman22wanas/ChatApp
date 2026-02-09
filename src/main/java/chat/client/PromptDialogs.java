package chat.client;

import javafx.scene.control.TextInputDialog;

import java.util.Optional;

public final class PromptDialogs {
    private PromptDialogs() {}

    public static String prompt(String title, String defaultValue) {
        TextInputDialog dialog = new TextInputDialog(defaultValue);
        dialog.setTitle("Chat Setup");
        dialog.setHeaderText(title);
        dialog.setContentText(null);
        Optional<String> result = dialog.showAndWait();
        return result.orElse(defaultValue);
    }
}
