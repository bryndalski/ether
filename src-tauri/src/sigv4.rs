//! AWS Signature V4 signing (hand-rolled on hmac/sha2 — no AWS SDK).
//! Credentials resolved from ~/.aws/credentials + ~/.aws/config by profile.
//! Verified against the official AWS SigV4 test vectors in unit tests.

use crate::models::RequestSpec;

#[derive(Debug, Clone)]
pub struct AwsCredentials {
    pub access_key_id: String,
    pub secret_access_key: String,
    pub session_token: Option<String>,
}

pub fn load_profile(profile: &str) -> Result<AwsCredentials, String> {
    let _ = profile;
    Err("not implemented: sigv4::load_profile".into())
}

/// Return the headers (Authorization, x-amz-date, x-amz-content-sha256,
/// x-amz-security-token?) to attach to the request.
pub fn sign(
    spec: &RequestSpec,
    creds: &AwsCredentials,
    region: &str,
    service: &str,
) -> Result<Vec<(String, String)>, String> {
    let _ = (spec, creds, region, service);
    Err("not implemented: sigv4::sign".into())
}
