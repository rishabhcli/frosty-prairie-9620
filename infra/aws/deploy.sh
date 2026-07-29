#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL_SECRET_ARN:?Set DATABASE_URL_SECRET_ARN to the existing Secrets Manager ARN}"

region="${AWS_REGION:-us-east-1}"
account_id="$(aws sts get-caller-identity --query Account --output text)"
bucket="${CONTACTSAFE_CODE_BUCKET:-contactsafe-deploy-${account_id}-${region}}"
key="releases/contactsafe-$(git rev-parse --short=12 HEAD).zip"

pnpm package:lambda

if ! aws s3api head-bucket --bucket "${bucket}" >/dev/null 2>&1; then
  aws s3api create-bucket --bucket "${bucket}" --region "${region}" >/dev/null
fi

aws s3 cp infra/aws/contactsafe-lambda.zip "s3://${bucket}/${key}" --only-show-errors
aws cloudformation deploy \
  --template-file infra/aws/template.yaml \
  --stack-name contactsafe \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    "CodeBucket=${bucket}" \
    "CodeKey=${key}" \
    "DatabaseUrlSecretArn=${DATABASE_URL_SECRET_ARN}" \
  --region "${region}" \
  --no-fail-on-empty-changeset

aws cloudformation describe-stacks \
  --stack-name contactsafe \
  --region "${region}" \
  --query "Stacks[0].Outputs[?OutputKey=='FunctionUrl'].OutputValue" \
  --output text
