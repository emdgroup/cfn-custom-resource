# cfn-custom-resource

This project provides a generic `Custom::Resource` for CloudFormation. Almost anything that can be done through the AWS API can be achieved through this custom resource. If CloudFormation has again not kept up with latest service updates or is missing some crucial configuration options, this might be very useful.

Here are a few examples of what additional resources you will be able to manage through CloudFormation with this little helper.

## Setup

The following snippet is required in each CloudFormation stack that wants to make use of this helper.

Download the `customresource.template.json` file from the [releases](https://github.com/emdgroup/cfn-custom-resource/releases) page and place it on an S3 bucket in your account.

```yaml
CustomResource:
  Type: AWS::CloudFormation::Stack
  Properties:
    TemplateURL: https://s3.amazonaws.com/my-templates/customresource/v1.1.2/customresource.template.json

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

## S3

## S3::BucketInventory

```yaml

Bucket:
  Type: AWS::S3::Bucket

BucketInventory:
  Type: Custom::BucketInventory
  DependsOn: CustomResourcePolicy
  Properties:
    ServiceToken: !GetAtt CustomResource.Outputs.ServiceToken
    Service: S3
    PhysicalResourceId: !Sub ${AWS::StackName}-BucketInventory-${!Random}
    Create:
      Action: putBucketInventoryConfiguration
      Parameters:
        Bucket: !Ref Bucket
        Id: ${PhysicalResourceId}
        InventoryConfiguration:
          Id: ${PhysicalResourceId}
          IncludedObjectVersions: Current
          OptionalFields: [Size, LastModifiedDate]
          IsEnabled: true
          Schedule:
            Frequency: Daily
          Filter:
            Prefix: abcdef/
          Destination:
            S3BucketDestination:
              Bucket: !GetAtt Bucket.Arn
              Format: CSV
              AccountId: !Ref AWS::AccountId
              Prefix: Inventory
    Delete:
      Action: deleteBucketInventoryConfiguration
      Parameters:
        Bucket: !Ref Bucket
        Id: ${PhysicalResourceId}
      IgnoreErrors: true
```

## RDS

### RDS::IAMAuthentication

```yaml
CustomResourcePolicy:
  Type: AWS::IAM::Policy
  Properties:
    PolicyName: RDS
    Roles: [!Ref CustomResourceRole]
    PolicyDocument:
      Version: '2012-10-17'
      Statement:
        - Effect: Allow
          Resource: !GetAtt Role.Arn
          Action: iam:PassRole
        - Effect: Allow
          Resource: !Sub arn:aws:rds:${AWS::Region}:${AWS::AccountId}:cluster:${DBCluster}
          Action:
            - rds:ModifyDBCluster
            - rds:AddRoleToDBCluster
            - rds:RemoveRoleFromDBCluster

EnableIAM:
  Type: Custom::RDSIAMAuthentication
  DependsOn: CustomResourcePolicy
  Properties:
    ServiceToken: !GetAtt CustomResource.Outputs.ServiceToken
    Service: RDS
    Create:
      Action: modifyDBCluster
      Parameters:
        DBClusterIdentifier: !Ref DBCluster
        EnableIAMDatabaseAuthentication: true
        ApplyImmediately: true
```

### RDS:RoleAttachment

```yaml
RoleAttachment:
  Type: Custom::RDSRoleAttachment
  DependsOn: CustomResourcePolicy
  Properties:
    ServiceToken: !GetAtt CustomResource.Outputs.ServiceToken
    Service: RDS
    Parameters:
      DBClusterIdentifier: !Ref DBCluster
      RoleArn: !GetAtt Role.Arn
    Create:
      Action: addRoleToDBCluster
    Delete:
      Action: removeRoleFromDBCluster
```

## KMS

### KMS::GenerateRandom

```yaml
  HmacSecret:
    Type: Custom::KMSRandomBytes
    DependsOn: CustomResourcePolicy
    Properties:
      ServiceToken: !GetAtt CustomResource.Outputs.ServiceToken
      Service: KMS
      Create:
        Action: generateRandom
        Parameters:
          NumberOfBytes: 36

# access random base64-encoded bytes with !GetAtt HmacSecret.Plaintext

```

## Cognito

### Cognito::UserPoolDomain

```yaml
UserPoolDomain:
  Type: Custom::CognitoUserPoolDomain
  Properties:
    ServiceToken: !GetAtt CustomResource.Outputs.ServiceToken
    Service: CognitoIdentityServiceProvider
    PhysicalResourceId: !Ref DomainName
    Parameters:
      UserPoolId: !Ref UserPool
      Domain: ${PhysicalResourceId}
    Create:
      Action: createUserPoolDomain
    Update:
      # Updates are not fully supported. This will delete the previous domain name.
      # You will have to create the new domain name manually through the API or console.
      Action: deleteUserPoolDomain
      IgnoreErrors: true
    Delete:
      Action: deleteUserPoolDomain
      IgnoreErrors: true
```

### Cognito::UserPoolClientSettings

`AWS::Cognito::UserPoolClient` doesn't allow defining some of the settings for a user pool, such as the callback URLs or the allowed OAuth flows and scopes. A regular `AWS::Cognito::UserPoolClient` resource needs to exist already.

```yaml
UserPoolClientSettings:
  Type: Custom::CognitoUserPoolClientSettings
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
        AllowedOAuthFlowsUserPoolClient: true
        CallbackURLs:
          - !Sub https://${HostedZone}/callback
```

### Cognito::ClientSecret

Although `AWS::Cognito::UserPoolClient` in theory returns a `ClientSecret` attribute, it only return a string that states that retrieving client secrets through CloudFormation are not supported at this time.

```yaml
UserPoolClientSecret:
  Type: Custom::CognitoClientSecret
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

### Cognito::UICustomization

```yaml
UserPoolUICustomization:
  Type: Custom::CognitoUICustomization
  Properties:
    ServiceToken: !GetAtt CustomResource.Outputs.ServiceToken
    Service: CognitoIdentityServiceProvider
    PhysicalResourceId: ALL
    Create:
      Action: setUICustomization
      Parameters:
        UserPoolId: !Ref UserPool
        ClientId: ALL
        CSS: |
          .logo-customizable { max-width: 50%; }
          .banner-customizable { background-color: white; }
          .socialButton-customizable { background-color: white; border: 1px solid #dddddd }
    Delete:
      Action: setUICustomization
      IgnoreErrors: true
      Parameters:
        UserPoolId: !Ref UserPool
        ClientId: ALL
        CSS: ''
        ImageFile: 'null'
```

## SES

### SES::DomainVerification

```yaml
DomainVerification:
  Type: Custom::SESDomainVerification
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
  Type: Custom::SESReceiptRuleSet
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
  Type: Custom::SESActivateDomainRuleSet
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
  Type: Custom::SESReceiptRule
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
