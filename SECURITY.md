# Security Policy

## Reporting a vulnerability

Please do **not** post exploit details, security credentials, access tokens, private user records, or unpublished vulnerabilities in a public issue or discussion.

When GitHub's **Private vulnerability reporting** option is enabled for this repository, use it through the repository's **Security** tab. Otherwise, contact a repository maintainer through an established private communication channel. A public GitHub issue is not a confidential reporting channel.

Do not attempt to access data or systems you do not own or have permission to test.

## Scope and response

This policy covers the code and configuration maintained in this repository. For vulnerabilities in third-party dependencies or upstream projects, consult the upstream project's reporting process as well. No response time or security certification is promised by this document.

## Secrets, privacy, and release safeguards

- Never commit API keys, passwords, OAuth secrets, session tokens, signing keys, database credentials, user data, or production database exports.
- Use a dedicated secret manager or protected deployment environment variables, and rotate any credential that may have been exposed.
- Review changes for accidental data disclosure and third-party license compliance before publication.
- Apply least-privilege repository access, protect the default branch, and enable available dependency and secret scanning controls through GitHub settings.
- Maintain independent backups and periodically test restoration.

These are required safeguards, **not a claim that every control is currently configured or verified**.

## Intellectual property

This policy does not transfer copyright, establish authorship or legal ownership, or change existing licenses. Contributors and maintainers must respect applicable third-party license and attribution requirements.
