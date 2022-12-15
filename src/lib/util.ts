export type Orderable = Date | bigint | number | string | boolean;
export type ID = bigint | number | string | boolean;

type HasKey<T> = { key?: string } & T;
export function setKey<T>(newIt?: HasKey<T>, key?: string) {
	let result = '';

	if (newIt) {
		result = key || newIt.key || newIt.toString();
		newIt.key = result;
	}
}

/**
 * ソート済みの配列に対して、指定要素を差し込む位置を特定する。
 * バイナリサーチ・アルゴリズム。
 * @param sortKeys 検索対象の配列
 * @param itemKey 位置を探す要素
 * @param isDesc false : 降順  true : 昇順
 * @return 番号を返す
 */
export function spliceAt(sortKeys: Orderable[], itemKey: Orderable, isDesc?: boolean): number;
export function spliceAt(sortKeys: Orderable[][], itemKey: Orderable[], isDesc?: boolean): number;
export function spliceAt(sortKeys: any[], itemKey: any, isDesc = false) {
	let head = 0;
	let tail = sortKeys.length;

	if (itemKey instanceof Array) {
		// 並び替え条件が配列

		if (isDesc) {
			// desc list scan.

			while (head < tail) {
				let sortCursor = itemKey.length;
				while (sortCursor--) {
					const sortIdx = itemKey.length - sortCursor;
					const idx = (head + tail) >>> 1;
					const b = itemKey[sortIdx] as Orderable;
					if (undefined === b) {
						head = idx + 1;
						break;
					}
					const a = (sortKeys as Orderable[][])[idx][sortIdx];
					if (undefined === a) {
						tail = idx;
						break;
					}
					if (b > a) {
						tail = idx;
						break;
					}
					if (a > b) {
						head = idx + 1;
						break;
					}
					if (sortIdx) {
						continue;
					}
					return idx + 1;
				}
			}
			return head;
		} else {
			// asc list scan.
			while (head < tail) {
				let sortCursor = itemKey.length;
				while (sortCursor--) {
					const sortIdx = itemKey.length - sortCursor;
					const idx = (head + tail) >>> 1;
					const b = itemKey[sortIdx] as Orderable;
					if (undefined === b) {
						head = idx + 1;
						break;
					}
					const a = (sortKeys as Orderable[][])[idx][sortIdx];
					if (undefined === a) {
						tail = idx;
						break;
					}
					if (b < a) {
						tail = idx;
						break;
					}
					if (a < b) {
						head = idx + 1;
						break;
					}
					if (sortIdx) {
						continue;
					}
					return idx + 1;
				}
			}
			return head;
		}
	} else {
		// 並び替え条件がプリミティブな値
		const b = itemKey as Orderable;
		if (undefined === b) return tail;

		if (isDesc) {
			// desc list scan
			while (head < tail) {
				const idx = (head + tail) >>> 1;

				const a = sortKeys[idx] as Orderable;
				if (undefined === a) {
					tail = idx;
					continue;
				}
				if (b > a) {
					tail = idx;
					continue;
				}
				if (a > b) {
					head = idx + 1;
					continue;
				}
				return idx + 1;
			}
			return head;
		} else {
			// asc list scan.
			while (head < tail) {
				const idx = (head + tail) >>> 1;

				const a = sortKeys[idx] as Orderable;
				if (undefined === a) {
					tail = idx;
					continue;
				}
				if (b < a) {
					tail = idx;
					continue;
				}
				if (a < b) {
					head = idx + 1;
					continue;
				}
				return idx + 1;
			}
			return head;
		}
	}
}
