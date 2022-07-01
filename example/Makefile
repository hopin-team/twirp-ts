
PROTOC_GEN_TWIRP_BIN="../protoc-gen-twirp_ts"
PROTOC_GEN_PROTOBUF_TS_BIN="./node_modules/.bin/protoc-gen-ts"
PROTOC_GEN_PROTOBUF_ES_BIN="./node_modules/.bin/protoc-gen-es"
PROTOC_GEN_TS_PROTO_BIN="./node_modules/.bin/protoc-gen-ts_proto"

OUT_DIR="./generated"

clean:
	rm -rf $(OUT_DIR)
	mkdir -p $(OUT_DIR)

ts-proto: clean
	protoc \
	-I ./protos \
	--plugin=protoc-gen-ts_proto=$(PROTOC_GEN_TS_PROTO_BIN) \
	--plugin=protoc-gen-twirp_ts=$(PROTOC_GEN_TWIRP_BIN) \
	--ts_proto_opt=esModuleInterop=true \
	--ts_proto_opt=useContext=true \
	--ts_proto_out=$(OUT_DIR) \
	--twirp_ts_opt="gateway" \
	--twirp_ts_opt="ts_proto" \
	--twirp_ts_opt="index_file" \
	--twirp_ts_opt="openapi_twirp" \
    --twirp_ts_opt="openapi_gateway" \
	--twirp_ts_out=$(OUT_DIR) \
	./protos/*.proto

protobuf-ts: clean
	protoc \
	-I ./protos \
	--plugin=protoc-gen-ts=$(PROTOC_GEN_PROTOBUF_TS_BIN) \
	--plugin=protoc-gen-twirp_ts=$(PROTOC_GEN_TWIRP_BIN) \
	--ts_opt=client_none \
	--ts_opt=generate_dependencies \
	--ts_out=$(OUT_DIR) \
	--twirp_ts_opt="gateway" \
	--twirp_ts_opt="index_file" \
	--twirp_ts_opt="openapi_twirp" \
    --twirp_ts_opt="openapi_gateway" \
	--twirp_ts_out=$(OUT_DIR) \
	./protos/*.proto

protobuf-es: clean
	protoc \
	-I ./protos \
	--plugin=protoc-gen-es=$(PROTOC_GEN_PROTOBUF_ES_BIN) \
	--plugin=protoc-gen-twirp_ts=$(PROTOC_GEN_TWIRP_BIN) \
	--es_opt=target=ts \
	--es_out=$(OUT_DIR) \
	--twirp_ts_opt="protobuf_es" \
	--twirp_ts_out=$(OUT_DIR) \
	./protos/*.proto
