
PROTOC_GEN_TWIRP_BIN="./node_modules/.bin/protoc-gen-twirp_ts"
PROTOC_GEN_PROTOBUF_TS_BIN="./node_modules/.bin/protoc-gen-ts"
PROTOC_GEN_TS_PROTO_BIN="./node_modules/.bin/protoc-gen-ts_proto"

OUT_DIR="./generated"

clean:
	rm -rf $(OUT_DIR)
	mkdir -p $(OUT_DIR)

ts-proto: clean
	protoc \
	-I ./protos \
	--plugin=protoc-gen-ts=$(PROTOC_GEN_TS_PROTO_BIN) \
	--plugin=protoc-gen-twirp_ts=$(PROTOC_GEN_TWIRP_BIN) \
	--ts_proto_opt=esModuleInterop=true \
	--ts_proto_opt=outputClientImpl=false \
	--ts_proto_out=$(OUT_DIR) \
	--twirp_ts_out=$(OUT_DIR) \
	./protos/*.proto

protobuf-ts: clean
	protoc \
	-I ./protos \
	--plugin=protoc-gen-ts=$(PROTOC_GEN_PROTOBUF_TS_BIN) \
	--plugin=protoc-gen-twirp_ts=$(PROTOC_GEN_TWIRP_BIN) \
	--ts_opt=client_none \
	--ts_out=$(OUT_DIR) \
	--twirp_ts_opt="protobufts=true" \
	--twirp_ts_out=$(OUT_DIR) \
	./protos/*.proto

