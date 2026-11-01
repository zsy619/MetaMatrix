FROM golang:1.27-alpine AS build

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/metamatrix-api ./cmd/server

FROM alpine:3.20

RUN apk add --no-cache ca-certificates wget
COPY --from=build /out/metamatrix-api /usr/local/bin/metamatrix-api
EXPOSE 3000
USER nobody
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD wget -qO- http://127.0.0.1:3000/health || exit 1
ENTRYPOINT ["metamatrix-api"]
