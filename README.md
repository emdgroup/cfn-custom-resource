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
            - ses:VerifyDomainIdentity

DomainVerification:
  Type: Custom::Resource
  DependsOn: CustomResourcePolicy
  Properties:
    ServiceToken: !GetAtt CustomResource.Outputs.ServiceToken
    Service: SES
    Parameters:
      Domain: !Ref Domain
    Create:
      Action: verifyDomainIdentity
```
