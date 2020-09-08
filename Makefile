deploy:
	COMPOSE_DOCKER_CLI_BUILD=1 DOCKER_BUILDKIT=1 docker-compose build
	docker-compose push
	ecs-cli compose service up \
		--target-groups 'targetGroupArn=arn:aws:elasticloadbalancing:us-east-1:517252388151:targetgroup/img-dn-ht/47bad7d0c178a71a,containerPort=8000,containerName=web'
