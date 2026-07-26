use buzz_sdk::{GitSourceMessage, ThreadRef};
use nostr::{EventBuilder, EventId};
use uuid::Uuid;

use crate::client::BuzzClient;
use crate::error::CliError;
use crate::validate::{
    parse_event_id, parse_uuid, percent_encode, validate_hex64, validate_repo_id,
};

pub(crate) struct GitConversationContext {
    pub(crate) channel_id: Option<String>,
    pub(crate) source_message: Option<GitSourceMessage>,
    activity: Option<ActivityContext>,
}

struct ActivityContext {
    channel_id: Uuid,
    source_message: EventId,
}

#[derive(Clone, Copy)]
pub(crate) enum GitEntityType {
    Repository,
    Issue,
    PullRequest,
    Patch,
}

impl GitEntityType {
    fn as_str(self) -> &'static str {
        match self {
            Self::Repository => "repository",
            Self::Issue => "issue",
            Self::PullRequest => "pull-request",
            Self::Patch => "patch",
        }
    }
}

pub(crate) fn parse_git_conversation_context(
    channel: Option<&str>,
    source_message: Option<&str>,
) -> Result<GitConversationContext, CliError> {
    if source_message.is_some() && channel.is_none() {
        return Err(CliError::Usage(
            "--source-message requires --channel".into(),
        ));
    }

    let channel_id = channel.map(parse_uuid).transpose()?;
    let source_event = source_message.map(parse_event_id).transpose()?;
    let source_message = match (channel_id, source_event) {
        (Some(channel_id), Some(source_message)) => Some(GitSourceMessage {
            channel_id: channel_id.to_string(),
            event_id: source_message.to_hex(),
        }),
        _ => None,
    };
    let activity = match (channel_id, source_event) {
        (Some(channel_id), Some(source_message)) => Some(ActivityContext {
            channel_id,
            source_message,
        }),
        _ => None,
    };

    Ok(GitConversationContext {
        channel_id: channel_id.map(|id| id.to_string()),
        source_message,
        activity,
    })
}

pub(crate) fn build_git_url(
    repo_owner: &str,
    repo_id: &str,
    entity_type: GitEntityType,
    entity_id: Option<&str>,
) -> Result<String, CliError> {
    validate_hex64(repo_owner)?;
    validate_repo_id(repo_id)?;
    let entity_id = entity_id
        .map(|id| parse_event_id(id).map(|parsed| parsed.to_hex()))
        .transpose()?;
    if !matches!(entity_type, GitEntityType::Repository) && entity_id.is_none() {
        return Err(CliError::Other(format!(
            "{} activity link is missing its entity ID",
            entity_type.as_str()
        )));
    }

    let repo = format!("{repo_owner}:{repo_id}");
    let mut url = format!(
        "buzz://git?repo={}&type={}",
        percent_encode(&repo),
        entity_type.as_str()
    );
    if let Some(id) = entity_id {
        url.push_str("&id=");
        url.push_str(&percent_encode(&id));
    }
    Ok(url)
}

fn markdown_link_label(title: &str) -> String {
    title
        .replace('\\', "\\\\")
        .replace('[', "\\[")
        .replace(']', "\\]")
}

fn build_activity_message(
    context: &ActivityContext,
    title: &str,
    git_url: &str,
) -> Result<EventBuilder, CliError> {
    let thread_ref = ThreadRef {
        root_event_id: context.source_message,
        parent_event_id: context.source_message,
    };
    let content = format!("Created [{}]({git_url})", markdown_link_label(title.trim()));
    buzz_sdk::build_message(
        context.channel_id,
        &content,
        Some(&thread_ref),
        &[],
        false,
        &[],
    )
    .map_err(|error| CliError::Other(format!("failed to build activity message: {error}")))
}

fn accepted_write_response(raw: &str, operation: &str) -> Result<serde_json::Value, CliError> {
    let value: serde_json::Value = serde_json::from_str(raw).map_err(|error| {
        CliError::Other(format!(
            "{operation} returned invalid JSON: {error} ({raw})"
        ))
    })?;
    if !value
        .get("accepted")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false)
    {
        let message = value
            .get("message")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("relay rejected the event");
        return Err(CliError::Other(format!("{operation} failed: {message}")));
    }
    Ok(value)
}

pub(crate) async fn publish_git_event(
    client: &BuzzClient,
    builder: EventBuilder,
    context: &GitConversationContext,
    entity_type: GitEntityType,
    title: &str,
    repo_owner: &str,
    repo_id: &str,
) -> Result<(), CliError> {
    let git_event = client.sign_event(builder)?;
    let git_event_id = git_event.id.to_hex();
    let git_response = client.submit_event(git_event).await?;
    let mut output = accepted_write_response(&git_response, "git entity publication")?;

    let Some(activity) = context.activity.as_ref() else {
        println!("{git_response}");
        return Ok(());
    };

    let link_id =
        (!matches!(entity_type, GitEntityType::Repository)).then_some(git_event_id.as_str());
    let git_url = build_git_url(repo_owner, repo_id, entity_type, link_id)?;
    let activity_builder = build_activity_message(activity, title, &git_url)?;
    let activity_event = client.sign_event(activity_builder)?;
    let activity_event_id = activity_event.id.to_hex();
    let activity_response = client.submit_event(activity_event).await.map_err(|error| {
        CliError::Other(format!(
            "{} {git_event_id} was created, but its conversation activity card failed: {error}",
            entity_type.as_str()
        ))
    })?;
    accepted_write_response(&activity_response, "conversation activity card").map_err(|error| {
        CliError::Other(format!(
            "{} {git_event_id} was created, but its conversation activity card failed: {error}",
            entity_type.as_str()
        ))
    })?;

    output
        .as_object_mut()
        .ok_or_else(|| CliError::Other("git publication response must be a JSON object".into()))?
        .insert(
            "activity_event_id".into(),
            serde_json::Value::String(activity_event_id),
        );
    println!("{output}");
    Ok(())
}

#[cfg(test)]
mod tests {
    use nostr::Keys;

    use super::*;

    #[test]
    fn git_url_encodes_repository_coordinate_and_uses_entity_id() {
        let owner = "a".repeat(64);
        let entity = "b".repeat(64);
        let url = build_git_url(&owner, "repo.v1", GitEntityType::PullRequest, Some(&entity))
            .expect("valid git URL");
        assert_eq!(
            url,
            format!("buzz://git?repo={owner}%3Arepo.v1&type=pull-request&id={entity}")
        );
    }

    #[test]
    fn repository_git_url_omits_entity_id() {
        let owner = "a".repeat(64);
        assert_eq!(
            build_git_url(&owner, "repo", GitEntityType::Repository, None)
                .expect("valid repository URL"),
            format!("buzz://git?repo={owner}%3Arepo&type=repository")
        );
    }

    #[test]
    fn conversation_tags_preserve_repository_metadata() {
        let source = GitSourceMessage {
            channel_id: "11111111-1111-4111-8111-111111111111".into(),
            event_id: "b".repeat(64),
        };
        let tags = buzz_sdk::build_git_conversation_tags(None, Some(&source))
            .expect("valid conversation tags");
        let event =
            buzz_sdk::build_repo_announcement("repo", Some("Repository"), None, &[], None, &[])
                .expect("repository builder")
                .tags(tags)
                .sign_with_keys(&Keys::generate())
                .expect("signed repository");

        assert!(event.tags.iter().any(|tag| tag.as_slice() == ["d", "repo"]));
        assert!(event
            .tags
            .iter()
            .any(|tag| tag.as_slice().first().map(String::as_str) == Some("buzz-source")));
    }

    #[test]
    fn source_message_requires_channel_and_valid_values() {
        assert!(parse_git_conversation_context(None, Some(&"a".repeat(64))).is_err());
        assert!(parse_git_conversation_context(Some("not-a-uuid"), None).is_err());
        assert!(parse_git_conversation_context(
            Some("11111111-1111-4111-8111-111111111111"),
            Some("not-an-event")
        )
        .is_err());
    }

    #[test]
    fn activity_message_is_threaded_to_source_and_escapes_title() {
        let source = parse_event_id(&"b".repeat(64)).expect("source event");
        let context = ActivityContext {
            channel_id: Uuid::parse_str("11111111-1111-4111-8111-111111111111").expect("channel"),
            source_message: source,
        };
        let event = build_activity_message(
            &context,
            r"Fix [parser]",
            "buzz://git?repo=owner%3Arepo&type=issue&id=abc",
        )
        .expect("activity builder")
        .sign_with_keys(&Keys::generate())
        .expect("signed activity");

        assert_eq!(event.kind.as_u16(), 9);
        assert_eq!(
            event.content,
            r"Created [Fix \[parser\]](buzz://git?repo=owner%3Arepo&type=issue&id=abc)"
        );
        assert!(event
            .tags
            .iter()
            .any(|tag| { tag.as_slice() == ["h", "11111111-1111-4111-8111-111111111111",] }));
        assert!(event
            .tags
            .iter()
            .any(|tag| { tag.as_slice() == ["e", &"b".repeat(64), "", "reply"] }));
    }
}
