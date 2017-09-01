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
