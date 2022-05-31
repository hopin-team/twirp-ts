.PHONY: all clean protobuf-ts
PROTOC_GEN_TWIRP_BIN="../../../protoc-gen-twirp_ts"
PROTOC_GEN_PROTOBUF_TS_BIN="../../../node_modules/.bin/protoc-gen-ts"

OUT_DIR="./"

ifeq ($(shell uname),Darwin)
SP=" "
endif

all: replace

clean:
	find $(OUT_DIR) -name '*.ts' -delete

protobuf-ts: clean
	protoc \
	-I ./ \
	-I ../../../example/protos \
	--plugin=protoc-gen-ts=$(PROTOC_GEN_PROTOBUF_TS_BIN) \
	--plugin=protoc-gen-twirp_ts=$(PROTOC_GEN_TWIRP_BIN) \
	--ts_opt=client_none \
	--ts_out=$(OUT_DIR) \
	--twirp_ts_opt="gateway" \
	--twirp_ts_out=$(OUT_DIR) \
	./service.proto

replace: protobuf-ts
	find $(OUT_DIR) -name '*.ts' -exec sed -i$(SP)'' 's/from "twirp-ts"/from "..\/index"/g' {} +
