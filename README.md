# cfn-custom-resource

This project provides a generic `Custom::Resource` for CloudFormation. Almost anything that can be done through the AWS API can be achieved through this custom resource. If CloudFormation has again not kept up with latest service updates or is missing some crucial configuration options, this might be very useful.

Here are a few examples of what additional resources you will be able to manage through CloudFormation with this little helper.

## Setup

The following snippet is required in each CloudFormation stack that wants to make use of this helper.

```yaml
CustomResource:
  Type: AWS::CloudFormation::Stack
  Properties:
    TemplateURL: https://s3-eu-west-1.amazonaws.com/hcie-templates/customresource/v1.0.0/customresource.template.json

CustomResourcePolicy:
  Type: AWS::IAM::Policy
  Properties:
    PolicyName: SES
    Roles: [!GetAtt CustomResource.Outputs.Role]
    PolicyDocument:
      Version: '2012-10-17'
      Statement:
        - Effect: Allow
          Resource: '*'
          Action:
            # add actions that the custom resource needs to have access to
            - ses:VerifyDomainIdentity
```

## Cognito

### Cognito::UserPoolClientDomain

```yaml
UserPoolClientDomain:
  Type: Custom::Cognito::UserPoolClientDomain
  Properties:
    ServiceToken: !GetAtt CustomResource.Outputs.ServiceToken
    Service: CognitoIdentityServiceProvider
    Parameters:
      UserPoolId: !Ref UserPool
      Domain: !Sub ${AWS::StackName}
    Create:
      Action: createUserPoolDomain
    Update:
      Action: deleteUserPoolDomain
    Delete:
      Action: deleteUserPoolDomain
      IgnoreErrors: true
```

### Cognito::UserPoolClientSettings

`AWS::Cognito::UserPoolClient` doesn't allow defining some of the settings for a user pool, such as the callback URLs or the allowed OAuth flows and scopes. A regular `AWS::Cognito::UserPoolClient` resource needs to exist already.

```yaml
UserPoolClientSettings:
  Type: Custom::Cognito::UserPoolClientSettings
  Properties:
    ServiceToken: !GetAtt CustomResource.Outputs.ServiceToken
    Service: CognitoIdentityServiceProvider
    Create:
      Action: updateUserPoolClient
      Parameters:
        UserPoolId: !Ref UserPool
        ClientId: !Ref UserPoolClient
        AllowedOAuthFlows: [code, implicit]
        AllowedOAuthScopes: [openid]
        SupportedIdentityProviders: [COGNITO]
        CallbackURLs:
          - !Sub https://${HostedZone}/_plugin/esproxy/callback
```

### Cognito::ClientSecret

Although `AWS::Cognito::UserPoolClient` in theory returns a `ClientSecret` attribute, it only return a string that states that retrieving client secrets through CloudFormation are not supported at this time.

```yaml
UserPoolClientSecret:
  Type: Custom::Cognito::ClientSecret
  Properties:
    ServiceToken: !GetAtt CustomResource.Outputs.ServiceToken
    Service: CognitoIdentityServiceProvider
    Create:
      Action: describeUserPoolClient
      Attributes: UserPoolClient
      Parameters:
        UserPoolId: !Ref UserPool
        ClientId: !Ref UserPoolClient

# The client secret will be accessible as !GetAtt UserPoolClientSecret.ClientSecret
```

## SES

### SES::DomainVerification

```yaml
DomainVerification:
  Type: Custom::SES::DomainVerification
  DependsOn: CustomResourcePolicy # Important: Otherwise you will run into Access Denied exception
  Properties:
    ServiceToken: !GetAtt CustomResource.Outputs.ServiceToken
    Service: SES
    Parameters:
      Domain: !Ref Domain
    Create:
      Action: verifyDomainIdentity

DomainVerificationRecord:
  Type: AWS::Route53::RecordSet
  Properties:
    HostedZoneId: !Ref HostedZone
    Name: !Sub _amazonses.${Domain}
    Type: TXT
    TTL: 300
    ResourceRecords:
      - !Sub '"${DomainVerification.VerificationToken}"'
```

### SES::ReceiptRuleSet

```yaml
DomainRuleSet:
  Type: Custom::SES::ReceiptRuleSet
  DependsOn: CustomResourcePolicy
  Properties:
    ServiceToken: !GetAtt CustomResource.Outputs.ServiceToken
    Service: SES
    Parameters:
      RuleSetName: !Ref Domain
    Create:
      Action: createReceiptRuleSet
    Delete:
      Action: deleteReceiptRuleSet

ActivateDomainRuleSet:
  Type: Custom::SES::ActivateDomainRuleSet
  DependsOn: DomainRuleSet
  Properties:
    ServiceToken: !GetAtt CustomResource.Outputs.ServiceToken
    Service: SES
    Create:
      Action: setActiveReceiptRuleSet
      Parameters:
        RuleSetName: !Ref Domain
    Delete:
      Action: setActiveReceiptRuleSet
      Parameters:
        RuleSetName: null
```

### SES::ReceiptRule

```yaml
DomainReceiptRule:
  Type: Custom::SES::ReceiptRule
  DependsOn: DomainRuleSet
  Properties:
    ServiceToken: !GetAtt CustomResource.Outputs.ServiceToken
    Service: SES
    Parameters:
      RuleSetName: !Ref Domain
      Rule:
        Name: default
        Enabled: true
        TlsPolicy: Optional
        ScanEnabled: true
        Recipients: [!Ref Domain]
        Actions:
          - SNSAction:
              TopicArn: !Ref Topic
              Encoding: UTF-8
    Create:
      Action: createReceiptRule
    Update:
      Action: updateReceiptRule
    Delete:
      Action: deleteReceiptRule
      Parameters:
        RuleSetName: !Ref Domain
        RuleName: default
```
