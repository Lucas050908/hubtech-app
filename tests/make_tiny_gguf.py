"""Tiny GGUF chat model (BIG=1: a ~700 MB one, to test downloading and loading a real-sized model) for testing the local AI pipeline (random weights; writes ASCII letters).

    pip install gguf numpy     # test-only, not a server dependency
    python3 tests/make_tiny_gguf.py /tmp/tiny.gguf
"""
import sys, numpy as np, gguf
out = sys.argv[1]
import os
BIG = os.environ.get("BIG") == "1"
E, L, H, FF, CTX = (1536, 12, 12, 4096, 8192) if BIG else (64, 2, 4, 128, 8192)
DT = np.float16 if BIG else np.float32
bs = [bytes([i]) for i in range(256)]
# gpt2 byte-level mapping
def bytes_to_unicode():
    b = list(range(ord("!"), ord("~")+1))+list(range(ord("¡"), ord("¬")+1))+list(range(ord("®"), ord("ÿ")+1))
    c = b[:]; n = 0
    for x in range(256):
        if x not in b: b.append(x); c.append(256+n); n += 1
    return dict(zip(b, map(chr, c)))
bu = bytes_to_unicode()
toks = [bu[i] for i in range(256)] + ["he", "<|im_start|>", "<|im_end|>", "<|endoftext|>"]
V = len(toks)
w = gguf.GGUFWriter(out, "llama")
w.add_name("hubtech-test-tiny")
w.add_context_length(CTX); w.add_embedding_length(E); w.add_block_count(L); w.add_feed_forward_length(FF)
w.add_head_count(H); w.add_head_count_kv(H); w.add_layer_norm_rms_eps(1e-5); w.add_rope_dimension_count(E // H)
w.add_file_type(gguf.LlamaFileType.MOSTLY_F16 if BIG else gguf.LlamaFileType.ALL_F32)
w.add_tokenizer_model("gpt2"); w.add_tokenizer_pre("default")
w.add_token_list(toks)
w.add_token_types([gguf.TokenType.NORMAL]*257 + [gguf.TokenType.CONTROL]*3)
w.add_token_merges(["h e"])
w.add_bos_token_id(V-1); w.add_eos_token_id(V-2); w.add_add_bos_token(False)
w.add_chat_template("{% for message in messages %}{{'<|im_start|>' + message['role'] + '\n' + message['content'] + '<|im_end|>' + '\n'}}{% endfor %}{% if add_generation_prompt %}{{ '<|im_start|>assistant\n' }}{% endif %}")
rng = np.random.default_rng(1)
r = lambda *s: (rng.standard_normal(s) * 0.02).astype(np.float32)
w.add_tensor("token_embd.weight", np.ones((V, E), np.float32))
w.add_tensor("output_norm.weight", np.ones(E, np.float32))
out_w = np.full((V, E), -20.0 / E, np.float32)
for ch in "abcdefghijklmnopqrstuvwxyz æøå.":
    for bt in ch.encode():
        if len(ch.encode()) == 1: out_w[bt] = (rng.uniform(2, 5)) / E
out_w[V-3] = 1.5 / E   # <|im_end|> (eos) sometimes

w.add_tensor("output.weight", out_w)
for i in range(L):
    p = f"blk.{i}."
    w.add_tensor(p+"attn_norm.weight", np.ones(E, np.float32))
    for n in ("attn_q", "attn_k", "attn_v", "attn_output"): w.add_tensor(p+n+".weight", np.zeros((E, E), DT))
    w.add_tensor(p+"ffn_norm.weight", np.ones(E, np.float32))
    w.add_tensor(p+"ffn_gate.weight", np.zeros((FF, E), DT)); w.add_tensor(p+"ffn_up.weight", np.zeros((FF, E), DT)); w.add_tensor(p+"ffn_down.weight", np.zeros((E, FF), DT))
w.write_header_to_file(); w.write_kv_data_to_file(); w.write_tensors_to_file(); w.close()
print("ok", out)
