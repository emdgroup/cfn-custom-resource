ARTIFACTS=artifacts

build:
	npm install -g cfn-include
	rm -fr ${ARTIFACTS}
	mkdir -p ${ARTIFACTS}
	cfn-include -t customresource.template.yml > ${ARTIFACTS}/customresource.template.json
