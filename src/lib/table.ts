import type { Readable, Subscriber, Unsubscriber } from 'svelte/store';
import { BasicTools } from './reduce-tools.js';
import { setKey, spliceAt, type ID, type Orderable } from './util.js';

type HasKey<T> = { key?: string } & T;
type IQuery<T> = HasKey<(item: T) => boolean>;
type IOrder<T> = HasKey<(item: T) => SortKey>;
type PKFK<T> = HasKey<(a: T) => (ID | undefined)[]>;

type SortKey = Orderable[] | Orderable;

type SubscribeSet<T> = readonly [run: Subscriber<T>, invalidate: (value?: T) => void];

type TablePipe<T> = {
	set(data: T[]): void;
	add(data: T[]): void;
	delBy(ids: ID[]): void;
};

type Entagle<T> = [
	Finder<T>,
	TableChildren<T>,
	string,
	T[] & TableExtra<T>,
	(key: ID) => T | undefined,
	IQuery<T>?
];

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
	};
type TableReadable<T> = Readable<T[] & TableExtra<T>> & {
	get(): T[] & TableExtra<T>;
	shuffle(): TableReadable<T>;
	where(query: IQuery<T>, key?: string): TableReadable<T>;
	order(order: IOrder<T>, key?: string): TableReadable<T>;
	reduce<R, TOOL>(
		mapper: IMapper<T, R, Tools<TOOL>>,
		key?: string,
		customTools?: (context: <G>(key: string) => MapReduceContext<T, G>) => TOOL
	): MapReduceReadable<R>;

	idx: string;
	entagle(): Entagle<T>;
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
type MapReduceWritable<T, R> = TablePipe<T> &
	MapReduceReadable<R> & {
		toReader(): MapReduceReadable<R>;
	};
type MapReduceReadable<R> = Readable<R> & {
	get(): R;
	idx: string;
};

type Foreign<A> = { [id: string]: A };
type Foreigns<A, B> = {
	[key: string]: [Foreign<A>, Foreign<B>];
};
type ForeignsList<B> =
	| [Foreigns<B, any>]
	| [Foreigns<B, any>, Foreigns<any, B>, ...Foreigns<any, any>[]];
type RelArgs<B> = [RelArg<B>, ...RelArg<any>[]];
type RelArg<A> = [a: TableReadable<A>, fk?: PKFK<A>, pk?: PKFK<A>];

function nop() {}

type Finder<A> = (a: A) => ID;

export function table<T>(finder: Finder<T>, data: T[]) {
	const writable = writableTable<T>(finder, {});
	writable.set(data);
	return writable;
}

export function relation<A>(...args: RelArg<A>) {
	return relationWritable<A, A>([{}], [args], undefined);
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

	const sortKeys: SortKey[] = [];
	const list: T[] & TableExtra<T> = [] as any;
	list.where = query?.key;
	list.order = sort?.key;
	list.orderType = orderType;
	list['find'] = find as any;

	let findAt: { [key in string]: T } = {};

	if (!query && !sort) {
		return {
			get,
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
			get,
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
		const { idx } = w;
		if (children[idx]) {
			w = children[idx] as typeof w;
		} else {
			w.set(list);
			children[idx] = w;
		}
		return w.toReader();
	}

	// Writable section.
	function toReader() {
		return { idx, get, subscribe, shuffle, where, order, reduce, entagle };
	}

	function reduce<R, TOOL>(
		mapper: IMapper<T, R, Tools<TOOL>>,
		key = undefined,
		customTools: (context: <G>(key: string) => MapReduceContext<T, G>) => TOOL = () => {
			return {} as TOOL;
		}
	) {
		setKey(mapper, key);
		return writableReduce<T, R, TOOL>(entagle(), mapper, customTools);
	}

	function entagle(): Entagle<T> {
		return [finder, baseChildren, baseIdx, list, find, query];
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
			const itemKey = sort(item);
			const idx = spliceAt(sortKeys as any, itemKey as any, orderType);
			sortKeys.splice(idx, 0, itemKey);
			list.splice(idx, 0, item);
		} else {
			list.push(item);
		}
	}

	// Readable section.
	function get() {
		return list;
	}

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
		setKey(newQuery, key);
		return toChild(writableTable<T>(finder, children, orderType, newQuery, sort));
	}

	function order(newSort: IOrder<T> | undefined, key = undefined) {
		setKey(newSort, key);
		const isSame = !sort || !newSort || sort.key === newSort.key;
		const newOrderType = isSame ? !orderType : true;
		return toChild(writableTable<T>(finder, children, newOrderType, query, newSort));
	}
}

function writableReduce<T, R, TOOL>(
	[finder, baseChildren, baseIdx, list, find, query]: Entagle<T>,
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

	return toChild({ idx, subscribe, get, set, add, delBy, toReader });

	// private section.
	function toChild(w: MapReduceWritable<T, R>): MapReduceReadable<R> {
		const { idx } = w;
		if (children[idx]) {
			w = children[idx] as typeof w;
		} else {
			w.set(list);
			children[idx] = w;
		}
		return w.toReader();
	}

	// Writable section for MapReduce
	function toReader(): MapReduceReadable<R> {
		return { idx, get, subscribe };
	}

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

	function delBy(ids: ID[]) {
		for (const id of ids) {
			for (const cb of Object.values(delAts[id as string])) {
				cb();
			}
		}
		publish();
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
	function get() {
		return result;
	}

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
}

function relationWritable<A, B>(
	binds: ForeignsList<B>,
	rules: RelArgs<B>,
	_tree?: 'all' | 'leaf' | 'node'
) {
	const [bind, bindB] = binds;
	const [rule] = rules;
	const [finder, children, baseIdx, list, find, query] = rule[0].entagle();
	const basePK: PKFK<B> = (a) => [finder(a)];
	const [B, toFK, toPK = basePK] = rule;
	rule[2] = toPK;

	setKey(toPK);
	setKey(toFK);
	const idx = rules.map(([B, toFK, toPK])=>`${B.entagle()[2]};${toPK?.key || ''};${toFK?.key || ''}`).join(';') + `;${_tree || ""}`;

	const subscribers = new Set<SubscribeSet<(...data: A[]) => B[]>>();

	let w = { set, add, delBy, toRelation };
	if (children[idx]) {
		w = children[idx] as typeof w;
	} else {
		console.log(children)	
		if (!_tree) {
			set(list);
			(children[idx] as typeof w) = w;
		}
	}
	return w.toRelation();

	function toRelation() {
		return { idx, to, tree, order };
	}

	function set(data: B[]) {
		for (const key of Object.keys(bind)) {
			bind[key][0] = {};
			if (bindB) bindB[key][1] = {};
		}
		add(data);
	}

	function add(data: B[]) {
		if (query) data = data.filter(query);

		for (const a of data) {
			const id = finder(a) as string;

			if (bind && toPK)
				for (const pk of toPK(a)) {
					if (undefined === pk) continue;
					bind[pk as string] ??= [{}, {}];
					bind[pk as string][0][id] = a;
				}

			if (bindB && toPK && !toFK)
				for (const pk of toPK(a)) {
					if (undefined === pk) continue;
					bindB[pk as string] ??= [{}, {}];
					bindB[pk as string][1][id] = a;
				}

			if (bindB && toFK)
				for (const fk of toFK(a)) {
					if (undefined === fk) continue;
					bindB[fk as string] ??= [{}, {}];
					bindB[fk as string][1][id] = a;
				}
		}
		publish();
	}

	function delBy(ids: ID[]) {
		for (const id of ids) {
			const a = find(id);
			if (!a) continue;

			if (bind && toPK)
				for (const pk of toPK(a)) {
					if (undefined === pk) continue;
					delete bind[pk as string][0][id as string];
				}

			if (bindB && toPK && !toFK)
				for (const pk of toPK(a)) {
					if (undefined === pk) continue;
					delete bindB[pk as string][1][id as string];
				}

			if (bindB && toFK)
				for (const fk of toFK(a)) {
					if (undefined === fk) continue;
					delete bindB[fk as string][1][id as string];
				}
		}
		publish();
	}

	function map(...data: A[]): B[] {
		if (_tree) {
			const alls: B[] = [];
			const nodes: B[] = [];
			const leafs: B[] = [];
			treeStep(forward(data) as any);

			if ('all' === _tree) return alls;
			if ('leaf' === _tree) return leafs;
			if ('node' === _tree) return nodes;
			return [];

			function treeStep(data: A[]) {
				for (const item of data) {
					const nextResult = forward([item]);
					if (nextResult.length) {
						alls.push(item as any);
						nodes.push(item as any);
						treeStep(nextResult as any);
					} else {
						alls.push(item as any);
						leafs.push(item as any);
					}
				}
			}
		} else {
			return forward(data);
		}
	}

	function forward(data: A[]): B[] {
		let idx = rules.length;

		while (--idx) {
			const rule = rules[idx];
			const bind = binds[idx];
			// rule === [A, toFK, (toPK)]
			// bind === [key][1][id][number]
			data = mapStep(data, bind, rule, 2, 1);
		}
		return data as any;
	}

	function backward(data: A[]): B[] {
		const tail = rules.length;
		let idx = 0;

		while (++idx < tail) {
			const rule = rules[idx];
			const bind = binds[idx];
			// rule === [A, (toFK), toPK]
			// bind === [key][0][id][number]
			data = mapStep(data, bind, rule, 1, 0);
		}
		return data as any;
	}

	function back() {}

	function publish() {
		// skip if stop.
		for (const [publishTo, invalidate] of subscribers) {
			invalidate();
			publishTo(map);
		}
	}

	function tree(mode?: 'all' | 'leaf' | 'node') {
		return relationWritable<A, B>(binds, rules, mode);
	}

	function to<C>(...args: RelArg<C>) {
		return relationWritable<A, C>([{}, ...binds] as ForeignsList<any>, [args, ...rules], _tree);
	}

	function order(newSort: IOrder<B> | undefined, key = undefined) {
		setKey(newSort, key);
		return toReader();
	}

	function toReader() {
		return { idx, get, subscribe, reduce };
	}

	function reduce<R, TOOL>(
		mapper: IMapper<B, R, Tools<TOOL>>,
		key = undefined,
		customTools: (context: <G>(key: string) => MapReduceContext<B, G>) => TOOL = () => {
			return {} as TOOL;
		}
	) {
		setKey(mapper, key);
		return writableReduce<B, R, TOOL>(rule[0].entagle(), mapper, customTools);
	}

	// Readable section.
	function get() {
		return map;
	}
	function subscribe(
		run: (map: (...data: A[]) => B[]) => void,
		invalidate: (value?: (...data: A[]) => B[]) => void = nop
	): Unsubscriber {
		const subscriber = [run, invalidate] as const;
		subscribers.add(subscriber);
		if (subscribers.size === 1) {
			// do START. // stop = start(set)
		}

		run(map);

		return () => {
			subscribers.delete(subscriber);
			if (subscribers.size === 0) {
				// do STOP. // stop!(); stop = null;
			}
		};
	}
}

function mapStep<A, B>(
	data: A[],
	bind: Foreigns<any, any>,
	rule: RelArg<any>,
	keyIdx: 1 | 2,
	side: 0 | 1
) {
	const result: B[] = [];
	for (const item of data as any as B[]) {
		if (!item) continue;

		for (const key of rule[keyIdx]!(item)) {
			if (undefined === key) continue;

			const foreigns = bind[key as string]?.[side];
			if (!foreigns) continue;

			for (const to of Object.values(foreigns)) {
				result.push(to);
			}
		}
	}
	return result;
}
