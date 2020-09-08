# Image resizing server

A service for resizing images.

Example:

    https://img.dn.ht/img/s/500-500/https://dn.ht/journal/photos/mexico/IMG_4072-2.jpg

## Example architecture

- DNS img.dn.ht
- CloudFront CDN
    - AWS certificate manager for https
    - Cache policy to pass through headers
        - Accept (for webp content negotiation)
        - DPR, Width (for client hints)
- Elastic Load Balancer
- Load balancer target group: img-dn-ht
- ECS service img-dn-ht runs tasks that register themselves in target group
- ECS cluster running on an t3.micro EC2 server

I've got a Makefile to help deploy the service using ecs-cli / docker-compose.
