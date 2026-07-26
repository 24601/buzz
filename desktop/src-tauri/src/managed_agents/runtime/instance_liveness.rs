/// Check whether `buf` contains `id` as a complete identifier — not as a
/// prefix of a longer dotted name. The identifier appears in the Tauri config
/// JSON as `"identifier":"xyz.block.buzz.app.dev"` and in environment entries
/// as `KEY=...app.dev\0`, so a valid match is followed by a non-identifier byte
/// (not `[A-Za-z0-9._-]`) or sits at the end of the buffer. This prevents
/// `xyz.block.buzz.app` from matching inside `xyz.block.buzz.app.dev`.
pub(super) fn buffer_contains_identifier(buf: &[u8], id: &[u8]) -> bool {
    if id.is_empty() {
        return false;
    }
    buf.windows(id.len()).enumerate().any(|(i, w)| {
        if w != id {
            return false;
        }
        // Boundary check on the byte immediately after the match: end-of-buffer
        // or any byte that can't continue a dotted reverse-DNS identifier.
        match buf.get(i + id.len()) {
            None => true,
            Some(&next) => {
                !next.is_ascii_alphanumeric() && next != b'.' && next != b'_' && next != b'-'
            }
        }
    })
}
