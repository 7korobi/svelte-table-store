import type { Readable, Subscriber, Unsubscriber } from 'svelte/store';
import { BasicTools } from './reduce-tools.js';

export type Orderable = Date | bigint | number | string | boolean;
export type ID = bigint | number | string | boolean;

type HasKey<T> = { key?: string } & T;
type IQuery<T> = HasKey<(item: T) => boolean>;
type IOrder<T> = HasKey<(item: T) => Orderable[] | Orderable>;

type SubscribeSet<T> = readonly [run: Subscriber<T>, invalidate: (value?: T) => void];

type TablePipe<T> = {
	set(data: T[]): void;
	add(data: T[]): void;
	delBy(ids: ID[]): void;
};

type Entagle<T> = [Finder<T>, TableChildren<T>, string, T[] & TableExtra<T>, IQuery<T>?];

type TableExtra<T> = {
	orderType: boolean;
	where?: string;
	order?: string;
	find(key: ID): T | undefined;
};
type TableChildren<T> = { [idx in string]: TablePipe<T> };
type TableWritable<T> = TablePipe<T> &
	TableReadable<T> & {
		toReader(): TableReadable<T>;

		entagle(): Entagle<T>;
	};
type TableReadable<T> = Readable<T[] & TableExtra<T>> & {
	shuffle(): TableReadable<T>;
	where(query: IQuery<T>, key?: string): TableReadable<T>;
	order(order: IOrder<T>, key?: string): TableReadable<T>;
	reduce<R, TOOL>(
		mapper: IMapper<T, R, Tools<TOOL>>,
		key?: string,
		customTools?: (context: <G>(key: string) => MapReduceContext<T, G>) => TOOL
	): MapReduceReadable<R>;

	idx: string;
};

type GroupTool = <K extends string, G>(key: K, cb: () => G) => { [idx in K]: G };
type Tools<TOOL> = TOOL & ReturnType<typeof BasicTools> & { AT: GroupTool };

type IMapper<T, R, TOOL> = HasKey<(item: T, id: ID, tool: TOOL) => R>;

export type MapReduceContext<T, G> = readonly [
	G,
	(cb: () => void) => void,
	(cb: () => void) => void,
	(cb: () => void) => void,
	(cb: () => void) => void,
	<C>() => [C, T, ID]
];
type MapReduceChildren<T, R> = { [idx in string]: MapReduceWritable<T, R> };
type MapReduceWritable<T, R> = MapReduceReadable<R> & TablePipe<T>;
type MapReduceReadable<R> = Readable<R> & {
	idx: string;
};

function nop() {}

function subKey(oldIt: HasKey<any>, newIt: HasKey<any>, key?: string) {
	let result = '';

	if (newIt) {
		result = key || newIt.key || newIt.toString();
		newIt.key = result;
	}
}

function spliceAt(orderType: boolean, sortKeys: Orderable[][], itemKey: Orderable[]) {
	// バイナリサーチ
	if (orderType) {
		// desc list scan.
		let head = 0;
		let tail = sortKeys.length;

		while (head < tail) {
			let sortIdx = itemKey.length;
			while (sortIdx--) {
				const idx = (head + tail) >>> 1;
				const b = itemKey[sortIdx];
				if (undefined === b) {
					head = idx + 1;
					break;
				}
				const a = sortKeys[idx][sortIdx];
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
		let head = 0;
		let tail = sortKeys.length;

		while (head < tail) {
			let sortIdx = itemKey.length;
			while (sortIdx--) {
				const idx = (head + tail) >>> 1;
				const b = itemKey[sortIdx];
				if (undefined === b) {
					head = idx + 1;
					break;
				}
				const a = sortKeys[idx][sortIdx];
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
}

type Finder<A> = (a: A) => ID;

export function table<T>(finder: Finder<T>, data: T[]) {
	const writable = writableTable<T>(finder, {});
	writable.set(data);
	return writable;
}

function writableTable<T>(
	finder: Finder<T>,
	children: TableChildren<T>,
	orderType: boolean = false,
	query?: IQuery<T>,
	sort?: IOrder<T>
): TableWritable<T> {
	const idx = `${query?.key || ''}${orderType ? '+' : '-'}${sort?.key || ''}`;
	const subscribers = new Set<SubscribeSet<T[] & TableExtra<T>>>();

	const baseIdx = idx;
	const baseChildren = children;

	const sortKeys: Orderable[][] = [];
	const list: T[] & TableExtra<T> = [] as any;
	list.where = query?.key;
	list.order = sort?.key;
	list.orderType = orderType;
	list['find'] = find as any;

	let findAt: { [key in string]: T } = {};

	if (!query && !sort) {
		return {
			subscribe,
			shuffle,
			where,
			order,
			reduce,

			toReader,

			entagle,
			idx,

			set,
			add,
			delBy
		};

		// parent writable.
		function set(data: T[]) {
			if (query) data = data.filter(query);

			findAt = {};
			data.forEach(itemAdd);
			publish();

			for (const child of Object.values(children)) {
				child.set(data);
			}
		}

		function add(data: T[]) {
			data.forEach(itemAdd);
			publish();

			for (const child of Object.values(children)) {
				child.add(data);
			}
		}

		function delBy(ids: ID[]) {
			for (const child of Object.values(children)) {
				child.delBy(ids);
			}

			for (const id of ids) {
				const item = findAt[id as string];
				if (!item) continue;

				const idx = list.indexOf(item);
				list.splice(idx, 1);
				delete findAt[id as string];
			}
			publish();
		}
	} else {
		return {
			subscribe,
			shuffle,
			where,
			order,
			reduce,

			toReader,

			entagle,
			idx,

			set,
			add,
			delBy
		};

		// child writable.
		function set(data: T[]) {
			if (query) data = data.filter(query);

			findAt = {};
			list.length = 0;

			data.forEach(itemAdd);
			publish();
		}

		function add(data: T[]) {
			if (query) data = data.filter(query);

			data.forEach(itemAdd);
			publish();
		}

		function delBy(ids: ID[]) {
			for (const id of ids) {
				const item = findAt[id as string];
				if (!item) continue;

				const idx = list.indexOf(item);
				list.splice(idx, 1);
				delete findAt[id as string];
			}
			publish();
		}
	}

	// private section.
	function toChild(w: TableWritable<T>): TableReadable<T> {
		if (children[idx]) return children[idx] as TableWritable<T>;

		w.set(list);
		children[idx] = w;
		return w.toReader();
	}

	// Foreign section.
	function entagle(): Entagle<T> {
		return [finder, baseChildren, baseIdx, list, query];
	}

	// Readable section.
	function subscribe(
		run: (list: T[] & TableExtra<T>) => void,
		invalidate: (value?: T[] & TableExtra<T>) => void = nop
	): Unsubscriber {
		const subscriber = [run, invalidate] as const;
		subscribers.add(subscriber);
		if (subscribers.size === 1) {
			// do START. // stop = start(set)
		}

		run(list);

		return () => {
			subscribers.delete(subscriber);
			if (subscribers.size === 0) {
				// do STOP. // stop!(); stop = null;
			}
		};
	}

	function find(key: ID) {
		return findAt[key as string];
	}

	function shuffle() {
		const newSort: IOrder<T> = () => Math.random();
		newSort.key = 'shuffle';
		return toChild(writableTable<T>(finder, children, false, query, newSort));
	}

	function where(newQuery: IQuery<T> | undefined, key = undefined) {
		subKey(query, newQuery, key);
		return toChild(writableTable<T>(finder, children, orderType, newQuery, sort));
	}

	function order(newSort: IOrder<T> | undefined, key = undefined) {
		subKey(sort, newSort, key);
		const isSame = !sort || !newSort || sort.key === newSort.key;
		const newOrderType = isSame ? !orderType : true;
		return toChild(writableTable<T>(finder, children, newOrderType, query, newSort));
	}

	// Writable private section.
	function publish() {
		// skip if stop.
		for (const [publishTo, invalidate] of subscribers) {
			invalidate();
			publishTo(list);
		}
	}

	function itemAdd(item: T) {
		const id = finder(item) as string;
		if (findAt[id]) {
			const idx = list.indexOf(findAt[id]);
			delete findAt[id];
			list.splice(idx, 1);
			if (sort) sortKeys.splice(idx, 1);
		}
		findAt[id] = item;
		if (sort) {
			const itemKeyBase = sort(item);
			const itemKey: Orderable[] =
				itemKeyBase instanceof Array ? itemKeyBase.reverse() : [itemKeyBase];
			const idx = spliceAt(orderType, sortKeys, itemKey);
			sortKeys.splice(idx, 0, itemKey);
			list.splice(idx, 0, item);
		} else {
			list.push(item);
		}
	}

	// Writable section.
	function toReader() {
		return { idx, subscribe, shuffle, where, order, reduce, entagle };
	}

	function reduce<R, TOOL>(
		mapper: IMapper<T, R, Tools<TOOL>>,
		key = undefined,
		customTools: (context: <G>(key: string) => MapReduceContext<T, G>) => TOOL = () => {
			return {} as TOOL;
		}
	) {
		subKey(undefined, mapper, key);
		return writableReduce<T, R, TOOL>(entagle(), mapper, customTools);
	}
}

function writableReduce<T, R, TOOL>(
	[finder, baseChildren, baseIdx, list, query]: Entagle<T>,
	mapper: IMapper<T, R, Tools<TOOL>>,
	customTools: (context: <G>(key: string) => MapReduceContext<T, G>) => TOOL
) {
	const idx = `${baseIdx}:${mapper.key}`;
	const children = baseChildren as any as MapReduceChildren<T, R>;
	const subscribers = new Set<SubscribeSet<R>>();
	const result = {} as R;

	let locals: { [baseIdx in string]: any } = {};
	let inits: { [baseIdx in string]: () => void } = {};
	let calcs: { [baseIdx in string]: () => void } = {};
	let addAts: { [itemId in string]: { [baseIdx in string]: () => void } } = {};
	let delAts: { [itemId in string]: { [baseIdx in string]: () => void } } = {};

	let base: any = result;
	let item: T;
	let itemId: string;
	let groupIdx: string;
	let localIdx: number;

	const tools: Tools<TOOL> = {
		...BasicTools<T>(context),
		...customTools(context),
		AT<K extends string, G>(key: K, cb: () => G) {
			const stack = [base, groupIdx, localIdx];

			base[key] ||= {};
			base = base[key];
			groupIdx = `${groupIdx}/${localIdx}/${key}`;
			localIdx = 0;
			cb();

			[base, groupIdx, localIdx] = stack;

			return undefined as any as { [idx in K]: G };
		}
	};

	// toChild
	if (children[idx]) return children[idx] as MapReduceReadable<R>;

	set(list);
	children[idx] = { idx, subscribe, set, add, delBy };
	return { idx, subscribe } as MapReduceReadable<R>;

	// Mapper section for MapReduce
	function context<G>(ctxIdx: string): MapReduceContext<T, G> {
		++localIdx;
		const path = `${groupIdx}/${localIdx}/${ctxIdx}`;
		return [
			base as G,
			(cb) => {
				if (!inits[path]) cb();
				inits[path] = cb;
			},
			(cb) => {
				calcs[path] = cb;
			},
			(cb) => {
				addAts[itemId][path] = cb;
			},
			(cb) => {
				delAts[itemId][path] = cb;
			},
			() => {
				locals[path] ??= {};
				return [locals[path], item, itemId];
			}
		] as const;
	}

	// Readable section for MapReduce
	function subscribe(
		run: (result: R) => void,
		invalidate: (value?: R) => void = nop
	): Unsubscriber {
		const subscriber = [run, invalidate] as const;
		subscribers.add(subscriber);
		if (subscribers.size === 1) {
			// do START. // stop = start(set)
		}

		run(result);

		return () => {
			subscribers.delete(subscriber);
			if (subscribers.size === 0) {
				// do STOP. // stop!(); stop = null;
			}
		};
	}
	// Writable private section for MapReduce.
	function publish() {
		for (const cb of Object.values(calcs)) {
			cb();
		}

		// skip if stop.
		for (const [publishTo, invalidate] of subscribers) {
			invalidate();
			publishTo(result);
		}
	}

	function itemAdd(o: T) {
		item = o;
		itemId = finder(item) as string;
		groupIdx = '';
		localIdx = 0;

		const dels = delAts[itemId];
		addAts[itemId] = {};
		delAts[itemId] = {};
		mapper(item, itemId, tools);

		if (dels) {
			for (const cb of Object.values(dels)) {
				cb();
			}
		}

		for (const cb of Object.values(addAts[itemId])) {
			cb();
		}
	}

	// Writable section for MapReduce
	function set(data: T[]) {
		if (query) data = data.filter(query);

		for (const cb of Object.values(inits)) {
			cb();
		}

		data.forEach(itemAdd);
		publish();
	}

	function add(data: T[]) {
		if (query) data = data.filter(query);

		data.forEach(itemAdd);
		publish();
	}

	function delBy(ids: string[]) {
		for (const id of ids) {
			for (const cb of Object.values(delAts[id])) {
				cb();
			}
		}
		publish();
	}
}
