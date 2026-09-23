-- Additive, rerunnable. Keep the initial watermark unchanged on redeploy.
ALTER TABLE community_chat_messages
    ADD COLUMN IF NOT EXISTS mentions_json LONGTEXT NULL,
    ADD COLUMN IF NOT EXISTS reply_to_message_id BIGINT NULL,
    ADD COLUMN IF NOT EXISTS reply_snapshot LONGTEXT NULL;
ALTER TABLE community_chat_room_members
    ADD COLUMN IF NOT EXISTS last_read_message_id BIGINT NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS community_chat_attention_baseline (
    id TINYINT PRIMARY KEY,
    message_id BIGINT NOT NULL DEFAULT 0
) ENGINE=InnoDB;
INSERT IGNORE INTO community_chat_attention_baseline (id, message_id)
    SELECT 1, COALESCE(MAX(id), 0) FROM community_chat_messages;
CREATE INDEX IF NOT EXISTS idx_community_room_id ON community_chat_messages (room_id, id);
