build:
	cfn-include -t customresource.template.yml > artifacts/customresource.template.json

test: build
	cfn-include test/examples.config.yml | jq 'del(.Metadata)' > test/examples.config.json
	aws cloudformation create-stack --cli-input-json file://test/examples.config.json
	aws cloudformation wait stack-create-complete --stack-name custom-resource-test
	aws cloudformation delete-stack --stack-name custom-resource-test
	aws cloudformation wait stack-delete-complete --stack-name custom-resource-test

clean:
	rm -rf artifacts/ test/examples.config.json
