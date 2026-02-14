# based on https://github.com/bnkamalesh/golang-dockerfile/blob/master/Dockerfile-alpine

FROM golang:1.24-alpine AS builder

COPY . /app
WORKDIR /app

RUN CGO_ENABLED=0 go build -ldflags '-s -w -extldflags "-static"' -o /app/api *.go

FROM alpine:3.19

RUN apk update && \
    apk add -X http://dl-cdn.alpinelinux.org/alpine/edge/testing pdf2svg dvisvgm && \
    apk add -X http://dl-cdn.alpinelinux.org/alpine/edge/community asymptote && \
    apk add ca-certificates

RUN adduser -D appuser
USER appuser

COPY --from=builder /app /home/app/app

WORKDIR /home/app/app

EXPOSE 8050

CMD ["./api", "-addr", "0.0.0.0:8050"]

