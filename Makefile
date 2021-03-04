start-dev: export TAG = ${shell date +"%Y%m%d%H%M%S"}
start-dev:
	PORT=8000 docker-compose up

deploy: export TAG = ${shell date +"%Y%m%d%H%M%S"}
deploy:
	COMPOSE_DOCKER_CLI_BUILD=1 DOCKER_BUILDKIT=1 docker-compose build
	docker-compose push
	ecs-cli compose --verbose service up --cluster-config=au \
		--target-groups 'targetGroupArn=arn:aws:elasticloadbalancing:ap-southeast-2:517252388151:targetgroup/img-dn-ht/09879d023dc9e8eb,containerPort=8000,containerName=web' --force-deployment
