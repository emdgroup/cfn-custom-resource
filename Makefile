build:
	cfn-include -t customresource.template.yml > artifacts/customresource.template.json
	cfn-include -t test/examples.template.yml > artifacts/example.template.json

test:
	echo "Hello World"
